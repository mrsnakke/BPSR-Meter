This folder may contain a local copy of ECharts to support offline packaging.

Recommended steps to include ECharts in packaged builds:

1. Download the ECharts build (minified) and place it here as `echarts.min.js`.
   Example release: https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js

2. Ensure your packager (electron-builder, etc.) includes `public/libs/echarts/echarts.min.js` in the final distribution.

3. The app will attempt to load `/libs/echarts/echarts.min.js` first and fall back to the CDN when missing.

Notes:
- If you prefer CDN-only, no action is required.
- Do NOT include the full source map or development files unless you need them.
