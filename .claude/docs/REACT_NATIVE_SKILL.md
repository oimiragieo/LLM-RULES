# React Native Skill Guide

**Comprehensive guide to the React Native optimization skill with 38 mobile-specific rules.**

---

## Overview

The React Native skill (`vercel-react-native-skills`) analyzes React Native and Expo code for 38 mobile-specific optimization rules, developed by Vercel Labs for production mobile apps.

**Key features:**

- 38 mobile-specific optimization rules
- Platform-specific guidance (iOS vs Android)
- FlatList/SectionList optimization
- Animation performance patterns
- Memory management for mobile
- Expo-specific best practices

**Skill invocation:**

```javascript
Skill({ skill: 'vercel-react-native-skills' });
```

---

## What It Does

The skill performs automated code analysis to identify performance issues specific to React Native and Expo applications. It provides:

- Mobile-specific rule violations
- Platform-specific recommendations (iOS vs Android)
- FlatList optimization patterns
- Animation performance guidance
- Memory management best practices
- Expo-specific optimizations

**Analysis scope:**

- List rendering (FlatList, SectionList)
- Animation performance
- Memory management
- Image optimization
- Navigation patterns
- Platform-specific code
- Expo-specific features
- Native module usage

---

## Trigger Scenarios

Invoke this skill when:

1. **List Performance Issues**

   - "My FlatList is slow, how do I optimize"
   - "SectionList is laggy when scrolling"
   - "Long lists cause performance issues"

2. **Animation Problems**

   - "Animations are janky on Android"
   - "60 FPS animations not working"
   - "React Native Reanimated performance"

3. **Memory Issues**

   - "App crashes with large datasets"
   - "Memory usage keeps increasing"
   - "Images not releasing memory"

4. **General Mobile Optimization**
   - "React Native performance issues"
   - "Expo app optimization"
   - "Mobile app feels slow"

---

## Expected Outputs

### 1. Rule Violations

The skill identifies mobile-specific violations:

```
CRITICAL (8 violations)
- flatlist-key-extractor: Use keyExtractor for FlatList
- reanimated-worklet: Use worklets for 60 FPS animations
- ...

HIGH (12 violations)
- image-cache: Implement image caching
- navigation-optimize: Optimize navigation transitions
- ...

MEDIUM (10 violations)
- platform-specific: Use Platform.select for platform code
- ...

LOW (8 violations)
- haptic-feedback: Add haptic feedback for UX
- ...
```

### 2. Fix Suggestions

For each violation, the skill provides:

- **Mobile-specific problem** - Performance issue on mobile
- **Bad code example** - Current antipattern
- **Good code example** - Mobile-optimized pattern
- **Performance impact** - Expected improvement on iOS/Android

### 3. Platform-Specific Guidance

| Platform | Specific Issues                  | Recommendations                    |
| -------- | -------------------------------- | ---------------------------------- |
| iOS      | Memory warnings, animations      | Use native driver, reduce memory   |
| Android  | Overdraw, large lists            | Optimize layouts, virtualize lists |
| Expo     | Bundle size, native modules      | Use Expo modules, optimize assets  |

---

## Code Review Checklist

### Top 10 Mobile Optimization Rules

Use this checklist for manual code review:

#### 1. Use `keyExtractor` for FlatList (CRITICAL)

**Bad:**

```typescript
<FlatList
  data={items}
  renderItem={({ item }) => <Item id={item.id} />}
  // Missing keyExtractor - uses index, causes re-renders
/>
```

**Good:**

```typescript
<FlatList
  data={items}
  keyExtractor={(item) => item.id} // Stable keys
  renderItem={({ item }) => <Item id={item.id} />}
/>
```

**Impact:** Eliminates unnecessary re-renders, improves scroll performance.

---

#### 2. Use `getItemLayout` for Fixed-Height Items (CRITICAL)

**Bad:**

```typescript
<FlatList
  data={items}
  renderItem={({ item }) => <Item height={100} />}
  // No getItemLayout - FlatList measures every item
/>
```

**Good:**

```typescript
<FlatList
  data={items}
  getItemLayout={(data, index) => ({
    length: 100,
    offset: 100 * index,
    index,
  })}
  renderItem={({ item }) => <Item height={100} />}
/>
```

**Impact:** 50-80% faster initial render, instant scrolling.

---

#### 3. Use Worklets for 60 FPS Animations (CRITICAL)

**Bad:**

```typescript
import Animated from 'react-native-reanimated';

function Component() {
  const animatedValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    // JS thread - drops frames
    return {
      transform: [{ translateX: animatedValue.value }],
    };
  });
}
```

**Good:**

```typescript
import Animated from 'react-native-reanimated';

function Component() {
  const animatedValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'; // UI thread - 60 FPS
    return {
      transform: [{ translateX: animatedValue.value }],
    };
  });
}
```

**Impact:** Guarantees 60 FPS animations, no frame drops.

---

#### 4. Implement Image Caching (HIGH)

**Bad:**

```typescript
<Image source={{ uri: 'https://example.com/image.jpg' }} />
// No caching - re-downloads every render
```

**Good:**

```typescript
import FastImage from 'react-native-fast-image';

<FastImage
  source={{
    uri: 'https://example.com/image.jpg',
    priority: FastImage.priority.normal,
    cache: FastImage.cacheControl.immutable,
  }}
  resizeMode={FastImage.resizeMode.cover}
/>
```

**Impact:** 90% faster image loading, reduces network usage.

---

#### 5. Use `removeClippedSubviews` for Long Lists (HIGH)

**Bad:**

```typescript
<FlatList
  data={longList}
  renderItem={({ item }) => <Item />}
  // All items rendered, even offscreen
/>
```

**Good:**

```typescript
<FlatList
  data={longList}
  renderItem={({ item }) => <Item />}
  removeClippedSubviews={true} // Unmounts offscreen items
  maxToRenderPerBatch={10}
  windowSize={21}
/>
```

**Impact:** 60% lower memory usage, smoother scrolling.

---

#### 6. Optimize Navigation Transitions (HIGH)

**Bad:**

```typescript
<Stack.Navigator>
  <Stack.Screen name="Home" component={Home} />
  <Stack.Screen name="Details" component={Details} />
  // Default transitions - can be slow
</Stack.Navigator>
```

**Good:**

```typescript
<Stack.Navigator
  screenOptions={{
    animation: 'fade', // Faster than slide
    animationDuration: 200, // Shorter duration
  }}
>
  <Stack.Screen name="Home" component={Home} />
  <Stack.Screen name="Details" component={Details} />
</Stack.Navigator>
```

**Impact:** 40% faster navigation transitions.

---

#### 7. Use Platform-Specific Code (MEDIUM)

**Bad:**

```typescript
const styles = StyleSheet.create({
  container: {
    padding: 20, // Same on iOS and Android
  },
});
```

**Good:**

```typescript
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  container: {
    padding: Platform.select({
      ios: 20,
      android: 16, // Different padding for Android
    }),
  },
});
```

**Impact:** Better platform-native UX.

---

#### 8. Reduce Re-Renders with `memo` (MEDIUM)

**Bad:**

```typescript
function ListItem({ item }) {
  // Re-renders on every list update
  return <Text>{item.title}</Text>;
}
```

**Good:**

```typescript
const ListItem = React.memo(function ({ item }) {
  // Only re-renders when item changes
  return <Text>{item.title}</Text>;
});
```

**Impact:** 70% fewer re-renders in large lists.

---

#### 9. Use `InteractionManager` for Deferred Work (MEDIUM)

**Bad:**

```typescript
function Screen() {
  useEffect(() => {
    // Runs immediately - blocks UI
    heavyComputation();
  }, []);
}
```

**Good:**

```typescript
import { InteractionManager } from 'react-native';

function Screen() {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      // Runs after animations complete
      heavyComputation();
    });
    return () => task.cancel();
  }, []);
}
```

**Impact:** Smoother screen transitions, no UI blocking.

---

#### 10. Optimize Image Sizes (MEDIUM)

**Bad:**

```typescript
<Image source={{ uri: 'https://example.com/huge-image-4k.jpg' }} style={{ width: 100, height: 100 }} />
// Downloads 4K image for 100x100 display
```

**Good:**

```typescript
<Image
  source={{ uri: 'https://example.com/thumbnail-100x100.jpg' }}
  style={{ width: 100, height: 100 }}
/>
// Downloads appropriately sized image
```

**Impact:** 95% smaller image downloads, faster loading.

---

## Real-World Examples

### Before/After: FlatList Optimization

**Before (15 FPS scrolling):**

```typescript
<FlatList
  data={items}
  renderItem={({ item }) => <ComplexItem item={item} />}
/>
```

**After (60 FPS scrolling):**

```typescript
<FlatList
  data={items}
  keyExtractor={(item) => item.id}
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={21}
  renderItem={({ item }) => <MemoizedItem item={item} />}
/>

const MemoizedItem = React.memo(ComplexItem);
```

**Impact:** Scroll performance improved from 15 FPS to 60 FPS.

---

### Before/After: Animation Optimization

**Before (20-30 FPS animations):**

```typescript
import Animated from 'react-native-reanimated';

function Component() {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value, // JS thread
  }));

  return <Animated.View style={animatedStyle} />;
}
```

**After (60 FPS animations):**

```typescript
import Animated from 'react-native-reanimated';

function Component() {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'; // UI thread
    return {
      opacity: opacity.value,
    };
  });

  return <Animated.View style={animatedStyle} />;
}
```

**Impact:** Animations run at consistent 60 FPS.

---

### Before/After: Memory Optimization

**Before (300 MB memory usage):**

```typescript
<FlatList
  data={items} // 1000 items
  renderItem={({ item }) => (
    <View>
      <Image source={{ uri: item.imageUrl }} style={{ width: 400, height: 300 }} />
    </View>
  )}
/>
```

**After (100 MB memory usage):**

```typescript
import FastImage from 'react-native-fast-image';

<FlatList
  data={items}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  renderItem={({ item }) => (
    <View>
      <FastImage
        source={{ uri: item.thumbnailUrl, cache: FastImage.cacheControl.immutable }}
        style={{ width: 100, height: 75 }}
      />
    </View>
  )}
/>
```

**Impact:** Memory usage reduced by 67% (300 MB → 100 MB).

---

## Performance Impact Estimates

| Category               | Rules | Expected Improvement        |
| ---------------------- | ----- | --------------------------- |
| FlatList Optimization  | 8     | 60-90% faster scrolling     |
| Animation Performance  | 6     | 60 FPS guaranteed           |
| Memory Management      | 7     | 50-70% lower memory usage   |
| Image Optimization     | 5     | 80-95% faster image loading |
| Navigation Patterns    | 4     | 30-50% faster transitions   |
| Platform-Specific Code | 3     | Better native UX            |
| Expo Features          | 5     | 20-40% smaller bundle size  |

**Note:** Improvements vary based on device hardware and app complexity.

---

## Combined with Other Skills

### Pattern 1: Mobile App Comprehensive Review

```javascript
// Step 1: Component architecture
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Mobile optimization
Skill({ skill: 'vercel-react-native-skills' });
```

**Result:** Comprehensive mobile app review covering architecture and performance.

---

## Troubleshooting

### Issue: FlatList Still Slow

**Symptoms:**

- Low FPS when scrolling
- Janky animations
- Long list takes time to render

**Solutions:**

1. Verify `keyExtractor` is using stable IDs (not index)
2. Add `getItemLayout` if items have fixed height
3. Enable `removeClippedSubviews={true}`
4. Reduce `windowSize` from default (21) to 10-15
5. Use `React.memo()` on list items
6. Simplify item component (remove unnecessary nesting)

---

### Issue: Animations Dropping Frames

**Symptoms:**

- Animations stuttering
- Not hitting 60 FPS
- Frame drops during gestures

**Solutions:**

1. Use `react-native-reanimated` instead of `Animated`
2. Add `'worklet'` directive to `useAnimatedStyle`
3. Use `useNativeDriver: true` for Animated API
4. Avoid running heavy computations during animations
5. Use `InteractionManager` to defer non-urgent work

---

### Issue: High Memory Usage

**Symptoms:**

- App crashes on low-end devices
- Memory warnings in Xcode
- "Out of memory" errors

**Solutions:**

1. Use `removeClippedSubviews={true}` on long lists
2. Implement image caching with `react-native-fast-image`
3. Use thumbnail images instead of full resolution
4. Release large objects in `useEffect` cleanup
5. Reduce `windowSize` on FlatList
6. Avoid storing large data in component state

---

## Platform-Specific Optimizations

### iOS Optimizations

```typescript
import { Platform } from 'react-native';

// 1. Use native list components
if (Platform.OS === 'ios') {
  // Use SectionList for better performance
}

// 2. Optimize shadow rendering
const styles = StyleSheet.create({
  card: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
});

// 3. Use iOS-specific gestures
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

### Android Optimizations

```typescript
import { Platform, UIManager } from 'react-native';

// 1. Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 2. Optimize overdraw
const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent', // Avoid unnecessary backgrounds
  },
});

// 3. Use Android-specific components
import { DrawerLayoutAndroid } from 'react-native';
```

---

## Expo-Specific Optimizations

### 1. Use Expo Modules

```typescript
// Use Expo modules instead of community packages
import * as ImagePicker from 'expo-image-picker'; // Faster than react-native-image-picker
import * as FileSystem from 'expo-file-system'; // Better caching
```

### 2. Optimize Bundle Size

```bash
# Remove unused Expo modules
npx expo install --fix

# Use EAS Build for smaller bundles
eas build --platform ios --profile production
```

### 3. Use Expo Updates for OTA

```typescript
import * as Updates from 'expo-updates';

// Check for updates in background
async function checkForUpdates() {
  const update = await Updates.checkForUpdateAsync();
  if (update.isAvailable) {
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  }
}
```

---

## Performance Measurement

### 1. React Native Performance Monitor

```bash
# Enable in dev mode (shake device)
# Shows:
# - JS frame rate
# - UI frame rate
# - Memory usage
```

### 2. Flipper (Debugging)

```bash
npm install react-native-flipper

# Features:
# - Layout inspector
# - Network inspector
# - Performance profiler
```

### 3. Why Did You Render (Re-render tracking)

```bash
npm install @welldone-software/why-did-you-render
```

**Setup:**

```typescript
import whyDidYouRender from '@welldone-software/why-did-you-render';

if (__DEV__) {
  whyDidYouRender(React, {
    trackAllPureComponents: true,
  });
}
```

---

## Related Documentation

- [Skill Usage Guide](SKILL_USAGE_GUIDE.md) - Overview of all 5 skills
- [React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md) - Web React optimization
- [Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md) - Component architecture
- [Web Design Skill Guide](WEB_DESIGN_SKILL.md) - Accessibility and design
- [Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md) - Deployment automation

---

## Rule Categories

### 1. FlatList Optimization (8 rules, CRITICAL-HIGH)

- Use `keyExtractor`
- Use `getItemLayout` for fixed heights
- Enable `removeClippedSubviews`
- Optimize `windowSize`
- Use `maxToRenderPerBatch`
- Memoize list items
- Avoid anonymous functions in `renderItem`
- Use `initialNumToRender` appropriately

### 2. Animation Performance (6 rules, CRITICAL-HIGH)

- Use `react-native-reanimated` worklets
- Use `useNativeDriver: true`
- Avoid layout animations on Android
- Use `InteractionManager` for deferred work
- Optimize gesture handlers
- Use `runOnUI()` for UI thread work

### 3. Memory Management (7 rules, HIGH)

- Implement image caching
- Release large objects in cleanup
- Avoid memory leaks in listeners
- Use weak references for callbacks
- Clear intervals/timers
- Reduce bundle size
- Optimize asset sizes

### 4. Image Optimization (5 rules, HIGH)

- Use `react-native-fast-image`
- Use appropriate image sizes
- Implement progressive loading
- Cache images properly
- Optimize image formats

### 5. Navigation Patterns (4 rules, MEDIUM-HIGH)

- Optimize navigation transitions
- Lazy load screens
- Preload next screen
- Use native stack navigator

### 6. Platform-Specific Code (3 rules, MEDIUM)

- Use `Platform.select()`
- Handle platform differences
- Optimize for platform-specific UX

### 7. Expo Features (5 rules, MEDIUM)

- Use Expo modules
- Optimize bundle size
- Use EAS Build
- Implement OTA updates
- Optimize asset loading

---

## Conclusion

The React Native skill provides 38 mobile-specific optimization rules developed by Vercel Labs. Use this skill for mobile app code review, performance optimization, and troubleshooting mobile-specific issues.

**Invoke the skill:**

```javascript
Skill({ skill: 'vercel-react-native-skills' });
```

**Next steps:**

1. Run skill on your React Native codebase
2. Fix CRITICAL issues (FlatList, animations)
3. Fix HIGH issues (memory, images)
4. Test on low-end devices
5. Measure with React Native Performance Monitor
6. Iterate until 60 FPS achieved
