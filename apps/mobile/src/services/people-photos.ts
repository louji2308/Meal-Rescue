import AsyncStorage from '@react-native-async-storage/async-storage';

const PHOTOS_KEY = 'meal-rescue/common-table/people-photos';

/**
 * Local-only member photos. Household member profiles have no photo column;
 * the picture stays on-device so nobody's data leaves the phone. Keys are
 * plain member ids; values are local URI strings (file:// or content://).
 */
export async function loadPeoplePhotos(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(PHOTOS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export async function savePeoplePhoto(memberId: string, uri: string): Promise<void> {
  const photos = await loadPeoplePhotos();
  photos[memberId] = uri;
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}

export async function removePeoplePhoto(memberId: string): Promise<void> {
  const photos = await loadPeoplePhotos();
  if (!(memberId in photos)) return;
  delete photos[memberId];
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}