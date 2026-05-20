'use strict';

const fs = require('fs');
const path = require('path');

const DTAGS_ZH_CATEGORY_MAP = {
  '草莓':'食物','水果':'食物','食物':'食物','蛋糕':'食物','茶':'食物','咖啡':'食物','饮料':'食物',
  '头发':'头发','发型':'头发','马尾':'头发','辫子':'头发','刘海':'头发','长发':'头发','短发':'头发',
  '眼睛':'眼睛','眼神':'眼睛','瞳孔':'眼睛','目光':'眼睛','异色瞳':'眼睛',
  '微笑':'表情','笑':'表情','哭':'表情','生气':'表情','害羞':'表情','脸红':'表情','悲伤':'表情','愤怒':'表情','惊讶':'表情',
  '衣服':'服装','服装':'服装','裙子':'服装','衬衫':'服装','制服':'服装','汉服':'服装','连衣裙':'服装','衣领':'服装','领子':'服装','领口':'服装',
  '自然':'场景','花':'场景','树':'场景','天空':'场景','雨':'场景','雪':'场景','风':'场景','山':'场景','海':'场景',
  '城市':'场景','建筑':'场景','教室':'场景','房间':'场景','街道':'场景','学校':'场景','咖啡馆':'场景',
  '情绪':'表情','姿势':'姿势动作','坐':'姿势动作','站':'姿势动作','跑':'姿势动作','跳':'姿势动作','漂浮':'姿势动作','躺':'姿势动作','走':'姿势动作','飞':'姿势动作','游泳':'姿势动作','舞蹈':'姿势动作',
  '魔法':'魔法奇幻','火':'魔法奇幻','冰':'魔法奇幻','闪电':'魔法奇幻','发光':'魔法奇幻','光':'魔法奇幻',
  '动物':'动物','猫':'动物','狗':'动物','龙':'动物','狐':'动物','鸟':'动物','兔':'动物','狼':'动物',
  '幻想':'魔法奇幻','女巫':'魔法奇幻','骑士':'魔法奇幻','天使':'魔法奇幻','恶魔':'魔法奇幻','机甲':'魔法奇幻','精灵':'魔法奇幻','吸血鬼':'魔法奇幻',
  '时间':'天气时间','白天':'天气时间','夜晚':'天气时间','春天':'天气时间','夏天':'天气时间','秋天':'天气时间','冬天':'天气时间','星空':'天气时间','黄昏':'天气时间','黎明':'天气时间',
  '光影':'光影氛围','阳光':'光影氛围','月光':'光影氛围','灯光':'光影氛围','阴影':'光影氛围','逆光':'光影氛围',
  '构图':'构图','特写':'构图','全身':'构图','背景':'构图','远景':'构图','俯视角':'构图','仰视':'构图','侧面':'构图',
  '质量':'质量','杰作':'质量','高清':'质量','精细':'质量','最佳':'质量',
  '风格':'艺术风格','写实':'艺术风格','水彩':'艺术风格','动漫':'艺术风格','水墨':'艺术风格','赛博朋克':'艺术风格','古风':'艺术风格','像素':'艺术风格',
  '武器':'武器','剑':'武器','枪':'武器','弓':'武器','刀':'武器','斧':'武器','矛':'武器',
  '车辆':'交通工具','汽车':'交通工具','飞机':'交通工具','火车':'交通工具','船':'交通工具','摩托车':'交通工具','自行车':'交通工具',
  '配饰':'身体','眼镜':'身体','帽子':'身体','丝带':'身体','项链':'身体','耳环':'身体','戒指':'身体',
  '材质':'服装','丝绸':'服装','皮革':'服装','蕾丝':'服装','金属':'服装','棉':'服装',
  '印花':'服装','条纹':'服装','波点':'服装','格子':'服装','迷彩':'服装','碎花':'服装',
  '身体':'身体','皮肤':'身体','手臂':'身体','腿':'身体','手指':'身体','脚':'身体','嘴唇':'身体','尾巴':'身体','翅膀':'身体','角':'身体','耳朵':'身体',
  '画师':'画师','版权':'版权系列','角色':'角色',
  '白色':'服装','黑色':'服装','红色':'服装','蓝色':'服装','粉色':'服装','紫色':'服装','金色':'服装','银色':'服装',
};

const DTAGS_WASTE_PATTERNS = [
  /^(looking_at_viewer|simple_background|white_background|transparent_background|solo|1girl|1boy|absurdres|highres|masterpiece|best_quality|official_art|signature|watermark|artist_name)$/i,
  /(from_above|from_below|pov|dutch_angle|wide_shot|close-up|zoom_layer|depth_of_field|blurry|motion_blur)/i,
];
const DTAGS_ALLOWED_IF_MENTIONED = /镜头|视角|构图|背景|看|注视|特写|全身|半身|远景|近景|俯视|仰视|水印|签名|相机|拍摄|截图|pov|camera|shot|background|view/i;

function createDtags(deps = {}) {
  const {
    state = { stats: {} },
    logLine = () => {},
    summarizeEvent = () => null,
    sendReply = () => {},
    callConfiguredLLM,
    isLLMConfigured = () => true,
    config = {},
  } = deps;

  const {
    DTAGS_DIR = path.join(process.cwd(), 'data', 'dtags'),
    DTAGS_ENABLED = true,
    DTAGS_MAX_REFERENCE_TAGS = 200,
    DTAGS_MAX_RESULTS = 18,
    DTAGS_LLM_MAX_TOKENS = 2048,
    DTAGS_LLM_TEMPERATURE = 0.3,
    LLM_TIMEOUT_MS = 30000,
    LLM_MODEL_JSON = 'qwen3.6-plus',
  } = config;

  let dtagsCache = null;

  function loadDtagsData() {
    if (dtagsCache) return dtagsCache;
    const tags = JSON.parse(fs.readFileSync(path.join(DTAGS_DIR, 'tags.json'), 'utf8'));
    const keywordIndex = JSON.parse(fs.readFileSync(path.join(DTAGS_DIR, 'keyword_index.json'), 'utf8'));
    const adjectiveCombos = JSON.parse(fs.readFileSync(path.join(DTAGS_DIR, 'adjective_combos.json'), 'utf8'));
    const tagMap = new Map();
    tags.forEach(t => tagMap.set(String(t.name || '').toLowerCase(), t));
    dtagsCache = { tags, keywordIndex, adjectiveCombos, tagMap };
    return dtagsCache;
  }

  function shouldSuppressDtag(tag, input) {
    const name = String(tag?.name || '').toLowerCase();
    if (!name) return true;
    if (tag?.is_deprecated) return true;
    if (DTAGS_ALLOWED_IF_MENTIONED.test(input)) return false;
    return DTAGS_WASTE_PATTERNS.some(re => re.test(name));
  }

  function getRelevantDtags(userInput) {
    const { tags, keywordIndex, tagMap } = loadDtagsData();
    const input = String(userInput || '').toLowerCase();
    const relevantTags = new Map();
    const relevantCats = new Set();

    for (const [zh, cat] of Object.entries(DTAGS_ZH_CATEGORY_MAP)) {
      if (input.includes(zh.toLowerCase())) relevantCats.add(cat);
    }
    for (const [cat, keywords] of Object.entries(keywordIndex)) {
      for (const kw of keywords) {
        const kwLower = String(kw).toLowerCase();
        const kwSpace = kwLower.replace(/_/g, ' ');
        if (input.includes(kwLower) || input.includes(kwSpace)) relevantCats.add(cat);
      }
    }
    const tokens = Array.from(new Set((input.match(/[a-z0-9_\-]{3,}|[\u4e00-\u9fa5]{1,}/g) || []).map(x => x.toLowerCase())));
    for (const tag of tags) {
      const name = String(tag.name || '').toLowerCase();
      const zh = String(tag.zh || '').toLowerCase();
      if (tokens.some(tok => name.includes(tok.replace(/\s+/g, '_')) || zh.includes(tok))) relevantTags.set(tag.name, tag);
    }
    if (relevantCats.size === 0 && relevantTags.size === 0) Object.keys(keywordIndex).forEach(c => relevantCats.add(c));
    for (const cat of relevantCats) {
      for (const tagName of (keywordIndex[cat] || [])) {
        const tag = tagMap.get(String(tagName).toLowerCase());
        if (tag) relevantTags.set(tagName, tag);
      }
    }
    return Array.from(relevantTags.values())
      .filter(t => !shouldSuppressDtag(t, userInput))
      .sort((a, b) => Number(b.post_count || 0) - Number(a.post_count || 0))
      .slice(0, DTAGS_MAX_REFERENCE_TAGS);
  }

  function parseJsonObject(text) {
    const raw = String(text || '').trim();
    const m = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || raw.match(/(\{[\s\S]*\})/);
    return JSON.parse(m ? m[1] : raw);
  }

  async function callDtagsLLM(prompt, maxTokens, temperature) {
    if (!isLLMConfigured()) throw new Error('missing LLM configuration');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const data = await callConfiguredLLM([{ role: 'system', content: '只返回 JSON' }, { role: 'user', content: prompt }], {
        max_tokens: maxTokens,
        temperature,
        signal: controller.signal,
        errorPrefix: 'LLM',
        task: 'json', studioModel: LLM_MODEL_JSON,
      });
      return String(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async function searchDtags(input) {
    const relevantTags = getRelevantDtags(input);
    const tagList = relevantTags.map(t => `${t.name} (${t.zh || ''}) [${t.category}]`).join('\n');

    const analyzePrompt = `分析用户描述，判断主要需要什么类型的 Danbooru 标签。\n用户描述:"${input}"\n返回 JSON：{"primary_type":"object/character/scene/action/style","secondary_types":["..."],"key_elements":["元素"],"should_add_quality_tags":bool,"should_add_generic_tags":bool}`;

    let intent = { primary_type:'object', secondary_types:[], key_elements:[], should_add_quality_tags:false, should_add_generic_tags:false };
    try { intent = { ...intent, ...parseJsonObject(await callDtagsLLM(analyzePrompt, 256, 0.1)) }; } catch (e) {}

    const matchPrompt = `你是 Danbooru 标签匹配专家。
用户描述:"${input}"
意图分析：用户主要想要 ${intent.primary_type} 类型标签
关键元素：${Array.isArray(intent.key_elements) && intent.key_elements.length ? intent.key_elements.join(', ') : input}
${intent.should_add_quality_tags ? '可添加质量标签' : '不要添加质量标签'}
${intent.should_add_generic_tags ? '可添加构图标签' : '不要添加无关的构图/背景/姿势标签，除非用户明确提到'}

词库参考：
${tagList}

组合词规则（非常重要！）：
Danbooru 标签支持组合词，可以根据需要生成以下模式的标签：
- 形状: {shape}_shaped (如 star_shaped, heart_shaped, diamond_shaped)
- 印花: {pattern}_print (如 floral_print, striped_print, polka_dot_print, animal_print)
- 装饰边: {material}_trim (如 ribbon_trim, lace_trim, fur_trim)
- 渐变色: gradient_{color} (如 gradient_hair, gradient_dress)
- 颜色组合: {color}_and_{color} (如 black_and_white, red_and_blue)
- 材质+物品: {material}_{object} (如 silk_dress, leather_boots, metal_armor)
- 颜色+特征: {color}_{feature} (如 blue_eyes, red_hair, golden_wings)

规则：
1. 用户只说具体物体，只返回与该物体直接相关的标签
2. 用户描述完整场景，可返回人物/服装/场景/姿势
3. 不要添加用户没提到的通用标签！尤其不要主动添加看镜头、视角、背景、构图、姿势等废词，除非用户明确说了
4. 词库只是参考，没有的标签自行翻译生成（Danbooru 命名规则：下划线分隔小写英文）
5. 利用组合词规则生成更精确的标签（如"星星形状"→ star_shaped, "碎花裙子"→ floral_print + skirt）
6. 如果用户输入很模糊、词库里没有完全对应词（如“精致的衣领”），除了给英文翻译型标签，也要从词库参考里挑几个真实存在且语义接近的具体词条（如 high_collar、frilled_collar、lace_collar、wing_collar 等）
7. 返回 10-30 个最匹配的标签即可

返回 JSON：{"tags":[{"name":"","zh":"","source":"database/llm_translated","reason":""}],"explanation":""}`;

    let result = parseJsonObject(await callDtagsLLM(matchPrompt, DTAGS_LLM_MAX_TOKENS, DTAGS_LLM_TEMPERATURE));
    if (!Array.isArray(result.tags)) result.tags = [];
    const { tagMap } = loadDtagsData();
    result.tags = result.tags
      .map(t => ({ name: String(t.name || '').trim().toLowerCase().replace(/\s+/g, '_'), zh: String(t.zh || '').trim(), source: String(t.source || '').trim() || 'llm_translated', reason: String(t.reason || '').trim() }))
      .filter(t => t.name && !shouldSuppressDtag(t, input))
      .map(t => {
        const db = tagMap.get(t.name);
        return db ? { ...t, zh: t.zh || db.zh || '', source: 'database', category: db.category, post_count: db.post_count } : t;
      })
      .slice(0, DTAGS_MAX_RESULTS);
    return result;
  }

  function buildDtagsReply(input, result) {
    const tags = (result.tags || []).slice(0, DTAGS_MAX_RESULTS);
    if (!tags.length) return `【D站查词】${input}\n没匹配到可用词条。可以换成更具体的物体/服装/动作再查。`;
    const lines = tags.map((t, i) => `${i + 1}. ${t.name}${t.zh ? `｜${t.zh}` : ''}${t.source === 'database' ? ' ✓' : ' ↗'}`);
    const exp = String(result.explanation || '').trim();
    return `【D站查词】${input}\n${lines.join('\n')}\n\n复制：${tags.map(t => t.name).join(', ')}${exp ? `\n说明：${exp.slice(0, 80)}` : ''}`;
  }

  async function handleDtagsCommand(ws, event, text) {
    if (!DTAGS_ENABLED) return false;
    const m = String(text || '').trim().match(/^\/查词\s*[，,、\s]+([\s\S]+)$/i);
    if (!m) return false;
    const input = m[1].trim().slice(0, 200);
    if (!input) return sendReply(ws, event, '用法：/查词，要查的词。例如：/查词，精致的衣领');
    try {
      const result = await searchDtags(input);
      return sendReply(ws, event, buildDtagsReply(input, result));
    } catch (err) {
      state.stats.llmErrors++;
      logLine('errors', { error: `dtags search failed: ${err.stack || err.message || err}`, eventSummary: summarizeEvent(event) });
      const fallback = getRelevantDtags(input).slice(0, 10).map(t => t.name);
      if (fallback.length) return sendReply(ws, event, `【D站查词】${input}\n智能匹配暂时失败，先给词库直搜：\n${fallback.join(', ')}`);
      return sendReply(ws, event, '查词暂时失败了，稍后再试。');
    }
  }

  return { handleDtagsCommand, searchDtags, getRelevantDtags, buildDtagsReply };
}

module.exports = { createDtags, createDtagSearch: createDtags };

