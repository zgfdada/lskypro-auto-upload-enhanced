import { getExtension } from "./path-utils";

export interface IStringKeyMap<T> {
  [key: string]: T;
}

const IMAGE_EXT_LIST = [
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
  ".svg",
  ".tiff",
  ".webp",
  ".avif",
];

export function isAnImage(ext: string) {
  return IMAGE_EXT_LIST.includes(ext.toLowerCase());
}
export function isAssetTypeAnImage(path: string): boolean {
  return isAnImage(getExtension(path));
}

export function getUrlAsset(url: string) {
  return (url = url.substring(1 + url.lastIndexOf("/")).split("?")[0]).split(
    "#"
  )[0];
}

export function getLastImage(list: string[]) {
  const reversedList = list.reverse();
  let lastImage;
  reversedList.forEach(item => {
    if (item && item.startsWith("http")) {
      lastImage = item;
      return item;
    }
  });
  return lastImage;
}

interface AnyObj {
  [key: string]: any;
}

export function arrayToObject<T extends AnyObj>(
  arr: T[],
  key: string
): { [key: string]: T } {
  const obj: { [key: string]: T } = {};
  arr.forEach(element => {
    obj[element[key]] = element;
  });
  return obj;
}
