import {
  BaseDirectory,
  createDir,
  readDir,
  readTextFile,
  writeFile
} from '@tauri-apps/api/fs';
import { debounce } from 'debounce';
import set from 'lodash.set';
import { createPinia } from 'pinia';

import { replacer, reviver } from './json';
import { removeBlackListedProperties } from './utils';

const DEFAULT_SINGLEFILE_NAME = 'pinia.json';
const DEFAULT_EXTENSION = 'json';

type ConfigBase = {
  readonly blacklist?: Record<string, any>;
};

type ConfigMonoFile = ConfigBase & {
  readonly singleFile: true;
  readonly filename?: string;
};

type ConfigMultiFiles = ConfigBase & {
  readonly singleFile: false;
  readonly storeFilename?: Record<string, string>;
};

function getFilename(
  storeId: string,
  storeFilename: Record<string, string> = {}
) {
  return storeFilename[storeId] || `${storeId}.${DEFAULT_EXTENSION}`;
}

function getStorename(
  filename: string,
  storeFilename: Record<string, string> = {}
) {
  return (
    Object.entries(storeFilename || {}).find(
      ([, value]) => value === filename
    )?.[0] || filename.slice(0, -DEFAULT_EXTENSION.length - 1)
  );
}

type ConfigTauriPinia = ConfigMonoFile | ConfigMultiFiles;

export async function tauriPinia(options?: ConfigTauriPinia) {
  const _options: ConfigTauriPinia = Object.assign(
    { singleFile: false },
    options
  );

  const load = async (init: any) => {
    try {
      if (_options.singleFile === false) {
        await createDir('stores', { recursive: true, dir: BaseDirectory.App });
        const files = await readDir('stores', { dir: BaseDirectory.App });
        const contents = await Promise.all(
          files
            .filter((file) => file.name?.endsWith('.json'))
            .map(async (file) => {
              try {
                return {
                  [getStorename(file.name, _options.storeFilename)]: JSON.parse(
                    await readTextFile(file.path),
                    reviver
                  )
                };
              } catch (err) {
                console.error('Could not read file', err);
              }
              return {};
            })
        );
        const store = contents.reduce<Record<string, any>>(
          (acc, val) => Object.assign(acc, val),
          {}
        );
        console.log('Loaded store', { ...store }, { ...init });
        return store;
      } else {
        await createDir('.', { recursive: true, dir: BaseDirectory.App });
        const store = JSON.parse(
          await readTextFile(_options.filename || DEFAULT_SINGLEFILE_NAME, {
            dir: BaseDirectory.App
          }),
          reviver
        );
        console.log('Loaded store', { ...store }, { ...init });
        return store;
      }
    } catch (err) {
      console.error('Could not read file', err);
    }
    return {};
  };

  const save = debounce(async (storeId: string, store: any, fullStore: any) => {
    try {
      if (_options.singleFile === false) {
        if (_options.blacklist) {
          store = removeBlackListedProperties(store, _options.blacklist);
        }
        console.log(`Saving store "${storeId}"`, store);

        await writeFile(
          {
            contents: JSON.stringify(store, replacer, 2),
            path: `stores/${getFilename(storeId, _options.storeFilename)}`
          },
          { dir: BaseDirectory.App }
        );
      } else {
        if (_options.blacklist) {
          fullStore = removeBlackListedProperties(fullStore, _options.blacklist);
        }
        console.log('Saving whole pinia', fullStore);
        await writeFile(
          {
            contents: JSON.stringify(fullStore, replacer, 2),
            path: _options.filename || DEFAULT_SINGLEFILE_NAME
          },
          { dir: BaseDirectory.App }
        );
      }
    } catch (err) {
      console.error('Could not save file', err);
    }
  }, 1000);

  const pinia = createPinia();

  // First load
  await load(pinia).then((store) => {
    console.log(store)
    if(store !== {}) {
      Object.keys(_options.blacklist).forEach(key => {
        set(store, key, _options.blacklist[key]);
      });
    }

    pinia.state.value = store;

    // connect read/write to saves
    pinia.use((ctx) => {
      // Saves on change
      ctx.store.$subscribe((mutation, state) => {
        console.log(mutation, state);
        save(mutation.storeId, state, pinia.state.value);
      });
    });
  });

  return pinia;
}
