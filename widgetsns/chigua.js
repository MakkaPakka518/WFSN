// =========================================================================
// Widget Metadata
// =========================================================================
var WidgetMetadata = {
  id: "heiliao_aggregator",
  title: "黑料社区",
  description: "全网吃瓜黑料聚合浏览与视频播放",
  author: "MakkaPakka",
  version: "1.0.1",
  requiredVersion: "0.0.2",
  detailCacheDuration: 60,
  modules: [
    {
      title: "频道分类",
      description: "按频道浏览黑料",
      requiresWebView: false,
      functionName: "loadCategory",
      type: "video",
      cacheDuration: 3600,
      params: [
        {
          name: "category", // 👈 统一集成到右上角菜单
          title: "选择频道",
          type: "enumeration",
          value: "hlcg",
          enumOptions: [
            { title: "🍉 最新黑料", value: "hlcg" },
            { title: "🔥 今日热瓜", value: "jrrs" },
            { title: "📈 热门黑料", value: "jqrm" },
            { title: "💎 经典黑料", value: "lsdg" },
            { title: "🏫 校园黑料", value: "xycg" },
            { title: "💃 网红黑料", value: "whhl" },
            { title: "🔞 反差专区", value: "fczq" },
            { title: "🎬 原创社区", value: "ycsq" },
            { title: "🌟 明星丑闻", value: "mxcw" },
            { title: "🏆 每日大赛", value: "mrds" },
            { title: "👯‍♀️ 黑料选妃", value: "hlxf" },
            { title: "🌙 深夜综艺", value: "syzy" },
            { title: "💥 独家爆料", value: "djbl" },
            { title: "🚀 每日热榜", value: "mrrb" },
            { title: "📅 周榜精选", value: "zbjx" },
            { title: "🗓️ 月榜热瓜", value: "ybrg" }
          ]
        },
        { name: "page", title: "页码", type: "page" }
      ]
    },
    {
      title: "内容搜索",
      description: "搜索吃瓜关键词",
      requiresWebView: false,
      functionName: "search",
      type: "video",
      cacheDuration: 3600,
      params: [
        { name: "keyword", title: "关键词", type: "input", description: "输入要搜索的内容" },
        { name: "page", title: "页码", type: "page" }
      ]
    }
  ]
};

// =========================================================================
// 核心常量与网络配置
// =========================================================================
const BASE_URL = "https://heiliao.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": BASE_URL,
  "Accept-Language": "zh-CN,zh;q=0.9"
};

// =========================================================================
// 1. 列表解析函数 (核心爬虫逻辑)
// =========================================================================
async function fetchItems(url) {
  try {
    const response = await Widget.http.get(url, { headers: HEADERS });
    const $ = Widget.html.load(response.data);
    const items = [];

    // 🚨 CSS 选择器兼容了主流CMS的类名，若抓不到数据需按F12检查并微调
    $('.video-item, .post-item, .item-list .item, .col-md-3, article').each((_, element) => {
      const el = $(element);
      
      // 提取标题 (兼容 attr('title') 属性和纯文本)
      let title = el.find('.title, h3, .video-title, a[title]').attr('title');
      if (!title) title = el.find('.title, h3, .video-title').text().trim();
      
      // 提取海报图 (兼容懒加载和直出图)
      let cover = el.find('img').attr('data-original') || el.find('img').attr('data-src') || el.find('img').attr('src');
      
      // 提取详情页链接
      let link = el.find('a').attr('href');
      
      // 提取播放时长/更新日期等辅助信息
      const duration = el.find('.duration, .time, .date, .video-overlay').text().trim();

      // 补全相对路径
      if (link && !link.startsWith('http')) link = BASE_URL + (link.startsWith('/') ? '' : '/') + link;
      if (cover && !cover.startsWith('http')) cover = BASE_URL + (cover.startsWith('/') ? '' : '/') + cover;

      if (title && link && link !== (BASE_URL + '/')) {
        items.push({
          id: link,             // ID直接使用详情页链接，传给 loadDetail
          type: "link",         // 标记为 link 类型
          mediaType: "movie",
          title: title,
          posterPath: cover || "",
          description: duration || "黑料在线",
          link: link            // 传递完整链接用于解析播放页
        });
      }
    });

    if (items.length === 0) {
      return [{ id: "empty", type: "text", title: "暂无数据", description: "可能是网址变更、解析规则失效或触发了验证码拦截。" }];
    }

    return items;
  } catch (error) {
    return [{ id: "error", type: "text", title: "加载异常", description: error.message }];
  }
}

// =========================================================================
// 2. 模块请求分发
// =========================================================================

// 获取分类
async function loadCategory(params) {
  const page = params.page || 1;
  const category = params.category || "hlcg";
  
  // 大多数视频CMS第二页规律是 /page/2 或 /index-2.html 
  // 此处采用最常见的 /page/2，如果翻页失败，可能需要修改此处格式
  const url = page === 1 ? `${BASE_URL}/${category}` : `${BASE_URL}/${category}/page/${page}`;
  return await fetchItems(url);
}

// 搜索
async function search(params) {
  const page = params.page || 1;
  const keyword = encodeURIComponent(params.keyword || "");
  // 同样默认搜索格式为 /search/关键词/page/1
  const url = page === 1 ? `${BASE_URL}/search/${keyword}` : `${BASE_URL}/search/${keyword}/page/${page}`;
  return await fetchItems(url);
}

// =========================================================================
// 3. 详情页及播放地址提取引擎 (智能正则)
// =========================================================================
async function loadDetail(link) {
  try {
    const response = await Widget.http.get(link, { headers: HEADERS });
    const htmlData = response.data;
    
    let videoUrl = "";

    // 方案 A：直接抓取 m3u8
    const m3u8Match = htmlData.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i) || htmlData.match(/(\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      videoUrl = m3u8Match[1];
    } 
    // 方案 B：直接抓取 mp4 链接
    else {
      const mp4Match = htmlData.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i) || htmlData.match(/(\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
      if (mp4Match) {
        videoUrl = mp4Match[1];
      } 
      // 方案 C：从 JS 变量里抓取 url="xxx"
      else {
        const sourceMatch = htmlData.match(/url\s*[:=]\s*['"](.*?)['"]/i) || htmlData.match(/source\s*[:=]\s*['"](.*?)['"]/i);
        if (sourceMatch && sourceMatch[1]) {
          videoUrl = sourceMatch[1].replace(/\\/g, ''); 
        }
      }
    }

    // 防御处理：依然找不到地址
    if (!videoUrl) {
      throw new Error("无法提取到播放地址，可能是由于动态加密或网站开启了真人验证。");
    }

    // 补全相对协议地址 (例如 //cdn.com/xxx.m3u8)
    if (videoUrl.startsWith('//')) {
      videoUrl = 'https:' + videoUrl;
    }

    // 成功返回播放器结构，系统会自动调起播放器
    return {
      url: videoUrl,
      type: videoUrl.includes('.m3u8') ? "hls" : "mp4"
    };

  } catch (error) {
    throw new Error(`解析播放地址失败: ${error.message}`);
  }
}
