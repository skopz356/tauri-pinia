import omit from 'omit-deep-lodash';

export const removeBlackListedProperties = (
  storeObject: any,
  blacklist: Record<string, any>
) => {
  return omit(storeObject, ...Object.keys(blacklist));
};
