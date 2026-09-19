import type { CapacitorConfig } from '@capacitor/cli'

// iOS/iPad packaging. The web build in `dist` is what gets wrapped, so the
// same code ships to GitHub Pages and to the App Store. Run `npx cap add ios`
// on a Mac with Xcode when you're ready. See README "Moving to iPad".
const config: CapacitorConfig = {
  appId: 'com.family.cardbinder',
  appName: 'Card Binder',
  webDir: 'dist',
  ios: { contentInset: 'automatic' },
}

export default config
