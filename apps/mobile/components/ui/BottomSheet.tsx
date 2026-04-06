import React, { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetProps as GorhomProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme/useTheme';

interface BottomSheetProps {
  children: React.ReactNode;
  snapPoints?: (string | number)[];
  onChange?: (index: number) => void;
  onClose?: () => void;
  enablePanDownToClose?: boolean;
  /** Pixels from the bottom of the screen to exclude (e.g. tab bar height). */
  bottomInset?: number;
}

export const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  function BottomSheet(
    {
      children,
      snapPoints: snapPointsProp,
      onChange,
      onClose,
      enablePanDownToClose = true,
      bottomInset = 0,
    },
    ref,
  ) {
    const { colors, tokens } = useTheme();

    const snapPoints = useMemo(
      () => snapPointsProp ?? ['50%', '80%'],
      [snapPointsProp],
    );

    const renderBackdrop = useCallback(
      (props: Parameters<NonNullable<GorhomProps['backdropComponent']>>[0]) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      [],
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        snapPoints={snapPoints}
        index={-1}
        enablePanDownToClose={enablePanDownToClose}
        onChange={onChange}
        onClose={onClose}
        bottomInset={bottomInset}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={[
          styles.handle,
          { backgroundColor: colors.border },
        ]}
        backgroundStyle={[
          styles.background,
          { backgroundColor: colors.surface },
        ]}
      >
        <View style={[styles.content, { paddingHorizontal: tokens.spacing.lg }]}>
          {children}
        </View>
      </GorhomBottomSheet>
    );
  },
);

export { default as GorhomBottomSheet } from '@gorhom/bottom-sheet';

const styles = StyleSheet.create({
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  background: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    flex: 1,
  },
});
