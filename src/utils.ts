import omit from 'omit-deep-lodash';

export const removeBlackListedProperties = (
  storeObject: any,
  blacklist: readonly string[]
) => {
  return omit(storeObject, ...blacklist);
};
