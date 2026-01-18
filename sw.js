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

// 建议的 sw.js 修复代码
self.addEventListener('fetch', (event) => {
    // 如果是 GitHub API 请求，直接走网络，不要拦截
    if (event.request.url.includes('api.github.com')) {
        return; 
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});