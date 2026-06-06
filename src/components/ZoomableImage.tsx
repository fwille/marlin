import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Dimensions, StyleSheet } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const SPRING = { damping: 20, stiffness: 200 };

interface Props {
  uri: string;
}

export function ZoomableImage({ uri }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Called from worklet context only
  const reset = () => {
    'worklet';
    scale.value = withSpring(1, SPRING);
    savedScale.value = 1;
    tx.value = withSpring(0, SPRING);
    ty.value = withSpring(0, SPRING);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.5), 6);
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1) {
        reset();
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      'worklet';
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1) {
        reset();
      } else {
        scale.value = withSpring(2.5, SPRING);
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, pan),
    pinch,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    // GestureHandlerRootView needed here because this renders inside a Modal,
    // which is a separate native layer not covered by the root-level one.
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Animated.Image
          source={{ uri }}
          style={[styles.image, animatedStyle]}
          resizeMode="contain"
        />
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    width: W,
    height: H * 0.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: W,
    height: H * 0.75,
  },
});
