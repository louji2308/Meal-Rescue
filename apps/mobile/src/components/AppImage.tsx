import React from 'react';
import { Image, type ImageProps } from 'expo-image';

/**
 * App-wide image component built on expo-image.
 *
 * - Disk + memory caching out of the box (avoids re-downloading avatars/photos).
 * - Fade transition on load so photos never "pop" in.
 * - `allowDownscaling` lets Glide decode remote images at display size,
 *   which is dramatically cheaper for large meal photos.
 * - `placeholderContentFit` + blur hash for instant perceived load.
 */
export function AppImage({ style, ...props }: ImageProps) {
  return (
    <Image
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={100}
      accessibilityIgnoresInvertColors
      allowDownscaling
      placeholderContentFit="cover"
      recyclingKey={typeof props.source === 'object' && props.source && 'uri' in props.source
        ? (props.source as { uri: string }).uri
        : undefined}
      style={style}
      {...props}
    />
  );
}

export type AppImageProps = ImageProps;

/**
 * Fire-and-forget avatar/photo warmup. Pulls urls into the disk cache so the
 * next time the list renders they appear instantly instead of "popping in".
 */
export function prefetchImages(urls: string[]) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;
  void Image.prefetch(unique, 'memory-disk').catch(() => {});
}