const CACHE_NAME = 'j-log-v1';
// 这里的列表是根据你的实际文件结构 整理的
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './ceshi.js',
    './clock.js',
    './site.webmanifest',
    './img/logo.svg',  // 包含你的图标
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
});

// 【合并后的唯一 fetch 监听器】
self.addEventListener('fetch', (event) => {
    // 1. 优先处理：如果是 GitHub API 请求，直接走网络，跳过缓存逻辑
    if (event.request.url.includes('api.github.com')) {
        return; //
    }

    // 2. 策略：尝试联网抓取，如果断网则 fallback 到缓存
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request).then((response) => {
                // 如果缓存中有资源，直接返回
                if (response) {
                    return response;
                }
                // 如果是页面跳转请求且没网没缓存，返回首页 index.html 作为兜底
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});