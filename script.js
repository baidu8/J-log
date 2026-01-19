const GITHUB_USER = 'baidu8'; 
const PAGE_SIZE = 10; // 这里可以自由修改每页显示的条数
let allGists = [];    // 仅存储当前页展示的数据
let searchPool = [];  // 全量索引池，专门给搜索框使用
let currentPage = 1;
let totalGistCount = 0; // 记录 Gist 总数
let isLoggedIn = false;

// 全局拦截：专门修复手机端目录点击闪回首页的问题
window.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.getAttribute('href')) {
        const href = link.getAttribute('href');
        // 如果点击的是以 #h 开头的目录链接
        if (href.startsWith('#h') || href.startsWith('#th-')) {
            e.preventDefault(); // 阻止默认跳转
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                // 手动执行平滑滚动
                const topOffset = 80; // 避开顶部导航栏的高度
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - topOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
                // 更新 hash 但不触发 hashchange 路由
                history.pushState(null, null, href);
            }
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', () => {
	// 修改后的注册代码
	if ('serviceWorker' in navigator) {
	    window.addEventListener('load', () => {
	        navigator.serviceWorker.register('./sw.js').then(reg => {
	            // 只有在第一次成功安装时才刷新，避免干扰 API 加载
	            reg.onupdatefound = () => {
	                const installingWorker = reg.installing;
	                installingWorker.onstatechange = () => {
	                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
	                        console.log('新版本已就绪，请刷新页面');
	                    }
	                };
	            };
	        });
	    });
	}
	// 监听网络状态切换
	window.addEventListener('online', () => {
	    document.getElementById('offline-indicator').style.display = 'none';
	    console.log('网络已恢复');
	});
	
	window.addEventListener('offline', () => {
	    document.getElementById('offline-indicator').style.display = 'block';
	    console.log('网络已断开');
	});
	
	// 初始化检查
	if (!navigator.onLine) {
	    document.getElementById('offline-indicator').style.display = 'block';
					// 3. --- 在这里【插入】新代码 ---
					    let deferredPrompt;
					    window.addEventListener('beforeinstallprompt', (e) => {
					        e.preventDefault(); // 阻止浏览器默认的小弹窗
					        deferredPrompt = e;  // 暂存事件
					        
					        // 只有当检测到可以安装时，我们才把提示条显示出来
					        const indicator = document.getElementById('offline-indicator');
					        if (indicator) {
					            indicator.innerText = "✨ 点击将 J-log 博客添加到桌面";
					            indicator.style.background = "#0984e3"; 
					            indicator.style.display = "block";
					            
					            indicator.onclick = () => {
					                deferredPrompt.prompt(); // 弹出真正的安装询问框
					                deferredPrompt.userChoice.then((result) => {
					                    if (result.outcome === 'accepted') {
					                        indicator.style.display = 'none';
					                    }
					                });
					            };
					        }
					    });
					    // --- 插入结束 ---
	}
    if (typeof initAnalogClock === 'function') initAnalogClock();
    checkLogin();
    handleRouting();
});

window.onhashchange = handleRouting;

function checkLogin() {
    isLoggedIn = !!localStorage.getItem('gh_token');
    const nav = document.getElementById('nav-actions');
    if (isLoggedIn) {
        nav.innerHTML = `<button class="btn-modern btn-primary" onclick="showEditor()">+ 新增</button>
                         <button class="btn-modern" onclick="logout()">退出</button>`;
    } else {
        nav.innerHTML = `<div id="login-form" style="display:none"><input type="password" id="token-input" class="btn-modern" style="width:100px" placeholder="Token" onkeypress="if(event.keyCode==13)saveToken()"></div>
                         <a href="javascript:void(0)" onclick="document.getElementById('login-form').style.display='block';this.style.display='none'" style="color:var(--light);font-size:14px;text-decoration:none">管理</a>`;
    }
}

function saveToken() {
    const t = document.getElementById('token-input').value;
    if (t) { localStorage.setItem('gh_token', t); location.reload(); }
}
function logout() { localStorage.removeItem('gh_token'); location.reload(); }

async function handleRouting() {
    const hash = window.location.hash;
    if (hash.startsWith('#/article/')) {
        readArticle(hash.replace('#/article/', ''));
    } else {
        showListUI();
        // 如果是第一次进入或从内容页返回，加载数据
        if (totalGistCount === 0) {
            await loadAllGists();
        } else {
            renderListPage();
        }
    }
}

// 【核心修改点 1】真·分页加载逻辑
async function loadAllGists() {
    try {
        const token = localStorage.getItem('gh_token');
        const headers = token ? { 'Authorization': `token ${token}` } : {};
        
        // 1. 获取用户信息拿到总数
        const userRes = await fetch(`https://api.github.com/users/${GITHUB_USER}`, { headers });
        const userData = await userRes.json();
        totalGistCount = userData.public_gists;

        // 2. 异步抓取全量索引（最多100条）用于搜索和热力图
        fetch(`https://api.github.com/users/${GITHUB_USER}/gists?per_page=100`, { headers })
            .then(res => res.json())
            .then(data => {
                searchPool = data;
                const chartBox = document.getElementById('chart-container');
                if (data.length > 0 && chartBox) {
                    chartBox.style.display = 'block';
                    renderChart(data);
                }
            });

        // 3. 加载当前页内容
        await fetchPage(currentPage);
    } catch (e) { console.error("Load failed", e); }
}

// 【核心修改点 2】按需抓取单页数据
async function fetchPage(page) {
    const list = document.getElementById('post-list');
    list.innerHTML = `<div style="padding:50px;text-align:center;color:#999">正在加载第 ${page} 页...</div>`;
    
    try {
        const token = localStorage.getItem('gh_token');
        const headers = token ? { 'Authorization': `token ${token}` } : {};
        const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/gists?page=${page}&per_page=${PAGE_SIZE}`, { headers });
        allGists = await res.json();
        currentPage = page;
        renderListPage();
        renderPagination();
    } catch (e) {
        list.innerHTML = '文章列表加载失败。';
    }
}

function renderListPage() {
    const list = document.getElementById('post-list');
    list.innerHTML = '';
    // 这里不再使用 slice，因为 allGists 已经是当前页的数据了
    allGists.forEach(gist => {
        const title = gist.description || "未命名文章";
        const fileName = Object.keys(gist.files)[0];
        const card = document.createElement('div');
        card.className = 'post-card card';
        card.onclick = () => window.location.hash = `#/article/${gist.id}`;
        card.innerHTML = `
            <div style="position: relative; padding-bottom: 10px;">
                <div class="post-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h2 style="margin: 0; font-size: 1.3rem; color: #2d3436; flex: 1;">${title}</h2>
                    ${isLoggedIn ? `
                        <div class="admin-btns" style="margin-left: 15px; flex-shrink: 0;">
                            <button class="btn-modern" onclick="event.stopPropagation(); editGist('${gist.id}')">编辑</button>
                            <button class="btn-modern" style="color:var(--danger)" onclick="event.stopPropagation(); deleteGist('${gist.id}')">删除</button>
                        </div>` : ''}
                </div>
                <div style="margin-bottom: 5px;">
                    <span class="post-filename" style="font-size: 0.8rem; color: #888; background: #f0f2f5; padding: 2px 8px; border-radius: 4px; font-family: monospace;">📄 ${fileName}</span>
                </div>
                <div style="text-align: right; margin-top: -10px;">
                    <span style="font-size: 0.8rem; color: #b2bec3; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        ${new Date(gist.created_at).toLocaleDateString()}
                    </span>
                </div>
            </div>`;
        list.appendChild(card);
    });
}

// 【核心修改点 3】根据总数生成分页，并绑定 fetchPage
function renderPagination() {
    const total = Math.ceil(totalGistCount / PAGE_SIZE);
    const container = document.getElementById('pagination');
    if (!container) return;
    container.innerHTML = '';
    if (total <= 1) return;
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = i === currentPage ? 'active' : '';
        btn.onclick = () => { 
            if(i !== currentPage) {
                fetchPage(i); 
                window.scrollTo({top: 0, behavior: 'smooth'}); 
            }
        };
        container.appendChild(btn);
    }
}

async function readArticle(id) {
    const body = document.getElementById('markdown-body');
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('content-view').style.display = 'block';
    body.innerHTML = '<div style="padding:40px;text-align:center;color:#999">正在加载内容...</div>';

    try {
        const res = await fetch(`https://api.github.com/gists/${id}`);
        const data = await res.json();
        const title = data.description || "未命名文章";
        const content = data.files[Object.keys(data.files)[0]].content;
        document.getElementById('post-detail-title').innerText = title;
        document.title = `${title} - J-log`;
        
        const token = localStorage.getItem('gh_token');
        const adminTools = document.getElementById('admin-tools');
        if (token && adminTools) {
            adminTools.style.display = 'flex';
            adminTools.dataset.currentId = id;
        }

        body.innerHTML = marked.parse(content);
								// ✨ 新增：提取并激活内容页中的 style 和 script
								const rawStyles = body.querySelectorAll('style');
								rawStyles.forEach(style => {
								    // 将 Markdown 里的 style 移动到 head 中使其生效
								    document.head.appendChild(style); 
								});
								
								const rawScripts = body.querySelectorAll('script');
								rawScripts.forEach(oldScript => {
								    const newScript = document.createElement('script');
								    // 复制所有属性（如 src 等）
								    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
								    // 复制脚本内容
								    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
								    // 重新插入 DOM 以激活执行
								    oldScript.parentNode.replaceChild(newScript, oldScript);
								});
        if (window.Prism) Prism.highlightAllUnder(body);
        addCopyButtons(); 
        
        if (window.innerWidth < 800) {
            const hs = body.querySelectorAll('h2, h3');
            if (hs.length > 0) {
                let toc = '<div id="toc-mobile"><strong>内容导航</strong><hr style="border:none;border-top:1px solid #eee;margin:10px 0">';
                hs.forEach((h, i) => { 
                    h.id = 'h'+i; 
                    toc += `<a href="#${h.id}" style="display:block;margin:8px 0;color:var(--primary);text-decoration:none"># ${h.innerText}</a>`; 
                });
                body.insertAdjacentHTML('afterbegin', toc + '</div>');
            }
        }
        generateTOC(body);
        window.scrollTo(0, 0);
    } catch(e) { 
        console.error(e);
        body.innerHTML = '文章内容加载失败。'; 
    }
				loadGiscus(id);
}

function addCopyButtons() {
    const pres = document.querySelectorAll('pre');
    pres.forEach(pre => {
        if (pre.querySelector('.copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerText = '复制';
        btn.onclick = () => {
            const code = pre.querySelector('code').innerText;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerText = '已复制!';
                setTimeout(() => { btn.innerText = '复制'; }, 2000);
            });
        };
        pre.appendChild(btn);
    });
}

function generateTOC(container) {
    const hs = container.querySelectorAll('h2, h3');
    const toc = document.getElementById('toc-content');
    const widget = document.getElementById('toc-widget');
    if (!toc || !widget) return;
    toc.innerHTML = '';
    if (hs.length > 0 && window.innerWidth >= 800) {
        widget.style.display = 'block';
        hs.forEach((h, i) => {
            h.id = 'th-'+i;
            const a = document.createElement('a');
            a.innerText = h.innerText;
            a.href = '#' + h.id;
            a.style = `display:block;padding:6px 0;color:var(--light);text-decoration:none;font-size:13px;border-bottom:1px solid #f9f9f9;`;
            a.onclick = (e) => { e.preventDefault(); h.scrollIntoView({behavior:'smooth'}); };
            toc.appendChild(a);
        });
    }
}

function showListUI() { 
	   const giscus = document.getElementById('giscus-container');
	       if (giscus) giscus.innerHTML = '';
					// 可以在这里通过重置样式表来清理
				const dynamicStyles = document.querySelectorAll('head style:not(#main-style)');
				dynamicStyles.forEach(s => s.remove());
    const adminTools = document.getElementById('admin-tools');
    if (adminTools) adminTools.style.display = 'none';
    document.title = "J-log"; 
    document.getElementById('list-view').style.display='block'; 
    const tocWidget = document.getElementById('toc-widget');
    if (tocWidget) tocWidget.style.display = 'none';
    const contentView = document.getElementById('content-view');
    const media = contentView.querySelectorAll('video, audio, iframe');
    media.forEach(m => {
        if (m.tagName === 'IFRAME') { const src = m.src; m.src = ''; m.src = src; } else { m.pause(); }
    });
    contentView.style.display='none'; 
}

function showEditor() { 
    document.getElementById('modal-overlay').style.display='flex'; 
    document.body.style.overflow='hidden'; 
    document.getElementById('editor-preview').innerHTML = marked.parse(document.getElementById('post-body').value || "");
}
function hideEditor() { document.getElementById('modal-overlay').style.display='none'; document.body.style.overflow='auto'; document.getElementById('edit-gist-id').value=''; }

async function editGist(id) {
    const res = await fetch(`https://api.github.com/gists/${id}`);
    const data = await res.json();
    const file = Object.keys(data.files)[0];
    document.getElementById('edit-gist-id').value = id;
    document.getElementById('post-desc').value = data.description;
    document.getElementById('post-file').value = file;
    document.getElementById('post-body').value = data.files[file].content;
    showEditor();
}

async function submitGist() {
    const token = localStorage.getItem('gh_token');
    const id = document.getElementById('edit-gist-id').value;
    const res = await fetch(id ? `https://api.github.com/gists/${id}` : `https://api.github.com/gists`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Authorization': `token ${token}` },
        body: JSON.stringify({
            description: document.getElementById('post-desc').value,
            public: true,
            files: { [document.getElementById('post-file').value || 'article.md']: { content: document.getElementById('post-body').value } }
        })
    });
    // 在刷新之前，先把拦截功能关掉
    if (res.ok) {
        window.onbeforeunload = null; 
        location.reload();
    };
}

async function deleteGist(id) {
    if (confirm('确定要删除吗？')) {
        await fetch(`https://api.github.com/gists/${id}`, { method: 'DELETE', headers: { 'Authorization': `token ${localStorage.getItem('gh_token')}` } });
        location.reload();
    }
}

function renderChart(gists) {
    const chartDom = document.getElementById('chart-container');
    if (!chartDom) return;
    const myChart = echarts.init(chartDom);
    const stats = {};

    gists.forEach(g => { 
        if (g.created_at) {
            const m = g.created_at.substring(0, 7); 
            stats[m] = (stats[m] || 0) + 1; 
        }
    });

    // 核心修复：严谨排序，确保 2026 在最后
    const months = Object.keys(stats).sort((a, b) => new Date(a) - new Date(b));

    myChart.setOption({
        title: { text: '发布活跃度', left: 'center', textStyle: {fontSize: 14, color: '#999'} },
        tooltip: { trigger: 'axis' },
        grid: { left: '10%', right: '10%', bottom: '25%' }, // 给底部标签留出空间
        xAxis: { 
            type: 'category', 
            data: months,
            axisLabel: { 
                fontSize: 10, 
                color: '#999',
                interval: 0,    // ✨ 强制显示所有月份标签，不许隐藏
                rotate: 45      // ✨ 手机端标签倾斜 45 度，防止重叠显示不下
            }
        },
        yAxis: { type: 'value', minInterval: 1 },
        // ✨ 新增：手机端允许横向缩放/滑动查看长轴
        dataZoom: [{
            type: 'inside', 
            start: 0, 
            end: 100
        }],
        series: [{ 
            data: months.map(m => stats[m]), 
            type: 'bar', 
            itemStyle: { color: '#0984e3', borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 15 // ✨ 手机端柱子窄一点更好看
        }]
    });
    
    window.addEventListener('resize', () => myChart.resize());
}

// 返回顶部功能
window.addEventListener('scroll', () => {
    const btn = document.getElementById("back-to-top");
    if (btn) {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btn.style.display = "block";
        } else {
            btn.style.display = "none";
        }
    }
});

document.getElementById("back-to-top").onclick = function() {
    window.scrollTo({ top: 0, behavior: "smooth" });
};

document.getElementById('post-body').addEventListener('input', function() {
    const preview = document.getElementById('editor-preview');
    preview.innerHTML = marked.parse(this.value);
    if (window.Prism) Prism.highlightAllUnder(preview);
});

// 【搜索优化】基于 searchPool 进行全局搜索
document.getElementById('search-input').addEventListener('input', function(e) {
    const keyword = e.target.value.toLowerCase().trim();
    const stats = document.getElementById('search-stats');
    const pagination = document.getElementById('pagination');
    
    if (keyword === "") {
        fetchPage(1); // 搜索清空时回到第一页内容
        if (stats) stats.style.display = 'none';
        if (pagination) pagination.style.display = 'flex';
        return;
    }

    const results = searchPool.filter(gist => {
        const title = (gist.description || "").toLowerCase();
        const fileName = Object.keys(gist.files)[0].toLowerCase();
        return title.includes(keyword) || fileName.includes(keyword);
    });

    renderFilteredList(results);
    if (stats) {
        stats.style.display = 'block';
        stats.innerText = `找到 ${results.length} 篇相关文章`;
    }
});

function renderFilteredList(results) {
    const list = document.getElementById('post-list');
    list.innerHTML = '';
    if (results.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 50px; color: #999;">🔍 没有找到包含该关键词的文章</div>`;
        return;
    }
    results.forEach(gist => {
        const title = gist.description || Object.keys(gist.files)[0];
        const fileName = Object.keys(gist.files)[0];
        const card = document.createElement('div');
        card.className = 'post-card card';
        card.onclick = () => window.location.hash = `#/article/${gist.id}`;
        card.innerHTML = `
            <div class="post-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h2 style="margin: 0; font-size: 1.3rem;">${title}</h2>
                ${isLoggedIn ? `
                    <div class="admin-btns">
                        <button class="btn-modern" onclick="event.stopPropagation(); editGist('${gist.id}')">编辑</button>
                        <button class="btn-modern" style="color:var(--danger)" onclick="event.stopPropagation(); deleteGist('${gist.id}')">删除</button>
                    </div>` : ''}
            </div>
            <div style="margin-bottom: 5px;">
                <span class="post-filename" style="font-size: 0.8rem; color: #888; background: #f0f2f5; padding: 2px 8px; border-radius: 4px; font-family: monospace;">📄 ${fileName}</span>
            </div>
            <div style="text-align: right; margin-top: -10px;">
                <span style="font-size: 0.8rem; color: #b2bec3;">${new Date(gist.created_at).toLocaleDateString()}</span>
            </div>`;
        list.appendChild(card);
    });
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
}

async function deleteArticle() {
    const id = document.getElementById('admin-tools').dataset.currentId;
    const token = localStorage.getItem('gh_token');
    if (id && confirm('确定要删除这篇文章吗？')) {
        try {
            const res = await fetch(`https://api.github.com/gists/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `token ${token}` }
            });
            if (res.status === 204) {
                alert('删除成功');
                window.location.hash = ''; 
                location.reload(); 
            }
        } catch (e) { alert('删除出错：' + e.message); }
    }
}
function loadGiscus(id) {
    const container = document.getElementById('giscus-container');
    if (!container) return; // 防错处理
    container.innerHTML = ''; // 切换文章时先清空旧评论

    const script = document.createElement('script');
    script.src = "https://giscus.app/client.js";
    
    // 你填写的这些 ID 看起来是正确的格式
    script.setAttribute("data-repo", "baidu8/J-log");
    script.setAttribute("data-repo-id", "R_kgDOQ8LaVw");
    script.setAttribute("data-category", "Announcements");
    script.setAttribute("data-category-id", "DIC_kwDOQ8LaV84C1G2X");
    
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", id); 
    
    script.setAttribute("data-reactions-enabled", "0");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", "light");
    script.setAttribute("data-lang", "zh-CN");
    script.setAttribute("data-loading", "lazy"); // 修正：正确设置懒加载
    
    script.crossOrigin = "anonymous";
    script.async = true;

    container.appendChild(script);
}
function insertTag(type) {
    // 【关键修改】确保这里指向的是内容框的 ID，而不是文件名框 post-file
    const textarea = document.getElementById('post-body') || document.querySelector('#editor-layout textarea'); 
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    let insertText = '';
    let cursorOffset = 0; // 用于控制插入后光标的位置

    switch(type) {
        case 'h1': insertText = `# ${selected || '一级标题'}`; break;
        case 'h2': insertText = `## ${selected || '二级标题'}`; break;
        case 'h3': insertText = `### ${selected || '三级标题'}`; break;
        case 'bold': insertText = `**${selected || '粗体文字'}**`; cursorOffset = selected ? 0 : 2; break;
        case 'italic': insertText = `*${selected || '斜体文字'}*`; cursorOffset = selected ? 0 : 1; break;
        case 'quote': insertText = `\n> ${selected || '引用文字'}\n`; break;
        case 'hr': insertText = `\n---\n`; break;
        case 'ul': insertText = `\n- ${selected || '列表项目'}`; break;
        case 'ol': insertText = `\n1. ${selected || '列表项目'}`; break;
        case 'link': 
            insertText = `[${selected || '显示文字'}]()\n`; 
            cursorOffset = (selected || '显示文字').length + 3; 
            break;
        case 'img': 
            insertText = `![${selected || '图片描述'}]()\n`; 
            cursorOffset = (selected || '图片描述').length + 4; 
            break;
        // HTML 嵌入代码快捷键
        case 'video':
            insertText = `\n<div class="video-wrapper">
<video class="custom-video" controls preload="metadata" poster="" playsinline webkit-playsinline muted><source src="" type="video/mp4"><source src="movie.webm" type="video/webm">您的浏览器不支持 HTML5 视频播放。</video></div>\n`;
            cursorOffset = 145; // 光标停在链接位置
            break;
        case 'iframe':
            insertText = `\n<div class="iframe-container">\n<iframe src="" title="描述内容" class="custom-iframe" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
    allowfullscreen
    loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>\n</div>\n`;
            cursorOffset = 45; 
            break;
		case 'photoLayout':
		    // 预设好 4 张图片的占位符，方便你直接填链接
		    insertText = `\n<div class="photo-layout">\n<img src="">\n<img src="">\n<img src="">\n<img src="">\n<img src="">\n</div>\n`;
		    cursorOffset = 38; // 让光标在插入后自动停在第一个链接处
		    break;
    }

    // 执行替换
    textarea.value = text.substring(0, start) + insertText + text.substring(end);
    
    // 重新聚焦并计算光标位置
    textarea.focus();
    if (cursorOffset > 0) {
        const newPos = start + cursorOffset;
        textarea.setSelectionRange(newPos, newPos);
    } else {
        // 默认光标跳到插入文字的最后
        const newPos = start + insertText.length;
        textarea.setSelectionRange(newPos, newPos);
    }
}
// 修正后的保险逻辑
window.onbeforeunload = function() {
    const textarea = document.getElementById('post-body'); // 统一使用 post-body
    if (textarea && textarea.value.trim().length > 0) {
        return "您有内容尚未保存！";
    }
};