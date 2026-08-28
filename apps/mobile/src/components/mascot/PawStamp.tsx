import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

interface PawStampProps {
  size?: number;
  rotation?: number;
  opacity?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * PawStamp - the Pro signature mark. Transparent black-and-white paw-print
 * rendered as a pressed-on ink stamp. Decorative only (pure premium garnish).
 */
export function PawStamp({ size = 24, rotation = 0, opacity = 1, style }: PawStampProps) {
  return (
    <View style={[{ width: size, height: size }, styles.lift, style]} pointerEvents="none">
      <Image
        source={require('../../../assets/cats-paw-print.png')}
        style={{
          width: size,
          height: size,
          opacity,
          transform: [{ rotate: `${rotation}deg` }],
        }}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lift: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
