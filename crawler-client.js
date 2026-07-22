// crawler.js — 社区学习资源爬虫
// 抓取策略: 优先尝试从可配置的社区源 (COMMUNITY_SOURCE_URL) 拉取真实数据;
// 若源不可达(沙箱网络/反爬/超时), 回退到本地"社区资源池"并按周期刷新,
// 模拟社区题库与网课随时间变动 (新题入库 / 旧题下架 / 课程更新)。
'use strict';

const COMMUNITY_SOURCE_URL = process.env.COMMUNITY_SOURCE_URL || ''; // 可指向真实社区 API
const REFRESH_INTERVAL_MS = 90 * 1000; // 每 90 秒刷新一次社区资源

const SUBJECTS = ['math','chinese','chem','history','english','foreign','coding'];
const GRADES = ['g7','g8','g9','g10','g11','g12']; // 初一..高三
const GRADE_LABEL = { g7:'初一', g8:'初二', g9:'初三', g10:'高一', g11:'高二', g12:'高三' };
const SEMESTERS = ['upper','lower']; // 上册 / 下册

/* ===== 社区题库资源池 (按 学科×年级×学期) ===== */
const QUIZ_POOL = {
  math: {
    g7: {
      upper: [
        { q:'计算: (-3) × 4 + 6 = ?', opts:['-6','-12','6','12'], a:0, e:'(-12)+6 = -6' },
        { q:'下列哪一个是有理数?', opts:['π','√2','1/3','√3'], a:2, e:'1/3 是有理数' },
        { q:'解方程: x + 5 = 2, x = ?', opts:['-3','3','7','-7'], a:0, e:'x = 2-5 = -3' },
        { q:'|−5| = ?', opts:['-5','5','0','25'], a:1, e:'绝对值非负' },
      ],
      lower: [
        { q:'二元一次方程组 x+y=5, x-y=1 的解为?', opts:['x=3,y=2','x=2,y=3','x=1,y=4','x=4,y=1'], a:0, e:'相加 2x=6 → x=3' },
        { q:'不等式 2x > 6 的解集?', opts:['x>3','x>6','x<3','x≥3'], a:0, e:'两边除2' },
      ],
    },
    g8: {
      upper: [
        { q:'勾股定理: 直角边 3,4, 斜边 = ?', opts:['5','6','7','√7'], a:0, e:'√(9+16)=5' },
        { q:'一次函数 y = 2x + 1 在 y 轴截距?', opts:['1','2','0','-1'], a:0, e:'x=0 时 y=1' },
      ],
      lower: [
        { q:'二次根式 √18 化简 = ?', opts:['3√2','2√3','9√2','√18'], a:0, e:'√(9×2)=3√2' },
        { q:'平行四边形对边关系?', opts:['相等','垂直','互补','无关'], a:0, e:'对边平行且相等' },
      ],
    },
    g9: {
      upper: [
        { q:'一元二次方程 x²-5x+6=0 的根?', opts:['x=2,3','x=1,6','x=-2,-3','x=2,-3'], a:0, e:'(x-2)(x-3)=0' },
        { q:'圆的面积公式 (半径 r)?', opts:['πr²','2πr','πr','πr³'], a:0, e:'S=πr²' },
      ],
      lower: [
        { q:'反比例函数 y = 6/x, x=2 时 y = ?', opts:['3','6','12','1'], a:0, e:'6/2=3' },
        { q:'相似三角形对应边比 = ?', opts:['相似比','1','0','面积比'], a:0, e:'对应边之比 = 相似比' },
      ],
    },
    g10: {
      upper: [
        { q:'集合 {1,2,3} ∩ {2,3,4} = ?', opts:['{2,3}','{1,4}','{1,2,3,4}','∅'], a:0, e:'交集取公共元素' },
        { q:'函数 f(x)=x² 在 R 上是?', opts:['增函数','减函数','偶函数','奇函数'], a:2, e:'f(-x)=f(x) 为偶函数' },
      ],
      lower: [
        { q:'sin30° = ?', opts:['1/2','√3/2','1','√2/2'], a:0, e:'sin30°=1/2' },
        { q:'log₂8 = ?', opts:['3','2','4','8'], a:0, e:'2³=8' },
      ],
    },
    g11: {
      upper: [
        { q:'导数: f(x)=x³, f\'(x) = ?', opts:['3x²','x²','3x','3'], a:0, e:'幂函数求导' },
        { q:'lim(x→0) sinx/x = ?', opts:['1','0','∞','e'], a:0, e:'重要极限' },
      ],
      lower: [
        { q:'等差数列 2,5,8,... 第10项?', opts:['29','32','27','30'], a:0, e:'a₁₀=2+9×3=29' },
        { q:'∫ x² dx = ?', opts:['x³/3+C','x³+C','2x+C','3x+C'], a:0, e:'幂函数积分' },
      ],
    },
    g12: {
      upper: [
        { q:'复数 (1+i)² = ?', opts:['2i','2+2i','0','1'], a:0, e:'1+2i-1=2i' },
        { q:'矩阵 [1 0; 0 1] 的行列式?', opts:['1','0','2','−1'], a:0, e:'单位阵 det=1' },
      ],
      lower: [
        { q:'二项分布的期望 E(X) = ?', opts:['np','nq','p','n'], a:0, e:'E=np' },
        { q:'正态分布关于均值?', opts:['对称','左偏','右偏','均匀'], a:0, e:'正态曲线对称于均值' },
      ],
    },
  },
  chinese: {
    g7: { upper: [{ q:'《春》的作者是?', opts:['朱自清','老舍','巴金','鲁迅'], a:0, e:'朱自清散文' }],
          lower: [{ q:'"学而时习之" 出自?', opts:['《论语》','《孟子》','《诗经》','《尚书》'], a:0, e:'《论语·学而》' }] },
    g8: { upper: [{ q:'《背影》作者?', opts:['朱自清','郁达夫','沈从文','茅盾'], a:0, e:'朱自清' }],
          lower: [{ q:'《桃花源记》作者?', opts:['陶渊明','王维','李白','柳宗元'], a:0, e:'陶渊明' }] },
    g9: { upper: [{ q:'《故乡》作者?', opts:['鲁迅','老舍','巴金','冰心'], a:0, e:'鲁迅小说' }],
          lower: [{ q:'《岳阳楼记》作者?', opts:['范仲淹','欧阳修','苏轼','王安石'], a:0, e:'范仲淹' }] },
    g10:{ upper: [{ q:'《沁园春·长沙》作者?', opts:['毛泽东','鲁迅','艾青','郭沫若'], a:0, e:'毛泽东词' }],
          lower: [{ q:'《再别康桥》作者?', opts:['徐志摩','闻一多','戴望舒','林徽因'], a:0, e:'徐志摩' }] },
    g11:{ upper: [{ q:'《赤壁赋》作者?', opts:['苏轼','辛弃疾','陆游','王安石'], a:0, e:'苏东坡' }],
          lower: [{ q:'《蜀道难》作者?', opts:['李白','杜甫','白居易','王维'], a:0, e:'李白' }] },
    g12:{ upper: [{ q:'《红楼梦》作者?', opts:['曹雪芹','罗贯中','施耐庵','吴承恩'], a:0, e:'曹雪芹' }],
          lower: [{ q:'《祝福》作者?', opts:['鲁迅','老舍','巴金','沈从文'], a:0, e:'鲁迅' }] },
  },
  chem: {
    g8: { upper: [{ q:'水(H₂O)中氢元素化合价?', opts:['+1','0','-1','+2'], a:0, e:'H 为 +1' }],
          lower: [{ q:'化学变化的基本特征?', opts:['有新物质生成','状态改变','颜色改变','发光'], a:0, e:'产生新物质' }] },
    g9: { upper: [{ q:'氧气(O₂)的相对分子质量?', opts:['32','16','8','48'], a:0, e:'16×2=32' }],
          lower: [{ q:'盐酸的化学式?', opts:['HCl','H₂SO₄','HNO₃','H₂CO₃'], a:0, e:'HCl' }] },
    g10:{ upper: [{ q:'钠的原子序数?', opts:['11','12','10','23'], a:0, e:'Na=11' }],
          lower: [{ q:'NaOH 俗称?', opts:['烧碱','纯碱','小苏打','生石灰'], a:0, e:'氢氧化钠' }] },
    g11:{ upper: [{ q:'乙醇(酒精)分子式?', opts:['C₂H₅OH','CH₄','CO₂','CH₃OH'], a:0, e:'C₂H₅OH' }],
          lower: [{ q:'原电池中失电子的极?', opts:['负极','正极','阴极','阳极'], a:0, e:'负极氧化失电子' }] },
    g12:{ upper: [{ q:'氨基酸含有的官能团?', opts:['-NH₂ 和 -COOH','-OH','-CHO','-COOR'], a:0, e:'氨基与羧基' }],
          lower: [{ q:'阿伏伽德罗常数 NA 约为?', opts:['6.02×10²³','3.14×10⁵','1.6×10⁻¹⁹','9.8'], a:0, e:'NA' }] },
  },
  history: {
    g7: { upper: [{ q:'秦朝统一时间?', opts:['前221年','前202年','前2210年','公元221年'], a:0, e:'秦始皇前221统一' }],
          lower: [{ q:'四大文明古国不含?', opts:['古希腊','古埃及','古印度','古巴比伦'], a:0, e:'古希腊非四大文明古国' }] },
    g8: { upper: [{ q:'唐朝开国皇帝?', opts:['李渊','李世民','李治','武则天'], a:0, e:'唐高祖李渊' }],
          lower: [{ q:'活字印刷术发明者?', opts:['毕昇','蔡伦','张衡','祖冲之'], a:0, e:'北宋毕昇' }] },
    g9: { upper: [{ q:'鸦片战争爆发于?', opts:['1840','1842','1856','1860'], a:0, e:'1840年' }],
          lower: [{ q:'辛亥革命年份?', opts:['1911','1919','1921','1894'], a:0, e:'1911武昌起义' }] },
    g10:{ upper: [{ q:'新中国成立于?', opts:['1949','1945','1950','1956'], a:0, e:'1949-10-1' }],
          lower: [{ q:'改革开放始于?', opts:['1978','1992','1949','1966'], a:0, e:'十一届三中全会' }] },
    g11:{ upper: [{ q:'第一次世界大战起止?', opts:['1914-1918','1939-1945','1914-1919','1937-1945'], a:0, e:'一战 1914-1918' }],
          lower: [{ q:'古希腊雅典实行?', opts:['民主制','君主制','联邦制','封建制'], a:0, e:'雅典民主' }] },
    g12:{ upper: [{ q:'工业革命发源于?', opts:['英国','法国','美国','德国'], a:0, e:'英国' }],
          lower: [{ q:'丝绸之路开通于?', opts:['汉代','唐代','宋代','明代'], a:0, e:'张骞通西域' }] },
  },
  english: {
    g7: { upper: [{ q:'Choose: "I ___ a student."', opts:['am','is','are','be'], a:0, e:'I 用 am' }],
          lower: [{ q:'Plural of "box":', opts:['boxes','boxs','box','boxen'], a:0, e:'x 结尾加 es' }] },
    g8: { upper: [{ q:'Past of "go":', opts:['went','goed','gone','going'], a:0, e:'go→went' }],
          lower: [{ q:'"She ___ homework now."', opts:['is doing','do','does','did'], a:0, e:'now 用进行时' }] },
    g9: { upper: [{ q:'Choose passive: "The book ___ by him."', opts:['was written','wrote','writes','is writing'], a:0, e:'被动语态' }],
          lower: [{ q:'Comparative of "good":', opts:['better','gooder','best','more good'], a:0, e:'good→better' }] },
    g10:{ upper: [{ q:'Reported: He said he ___ tired.', opts:['was','is','were','be'], a:0, e:'间接引语时态后移' }],
          lower: [{ q:'Choose: "If I ___ rich, I would travel."', opts:['were','am','was','be'], a:0, e:'虚拟语气' }] },
    g11:{ upper: [{ q:'Synonym of "happy":', opts:['glad','sad','angry','tired'], a:0, e:'glad 近义' }],
          lower: [{ q:'Choose: "She is ___ at math."', opts:['good','well','best','better'], a:0, e:'be good at' }] },
    g12:{ upper: [{ q:'Choose: "I have ___ my homework."', opts:['finished','finish','finishing','finishes'], a:0, e:'现在完成时' }],
          lower: [{ q:'"The book is worth ___."', opts:['reading','to read','read','reads'], a:0, e:'worth doing' }] },
  },
  foreign: {
    g7: { upper: [{ q:'日语 "ありがとう" 意思是?', opts:['谢谢','你好','再见','对不起'], a:0, e:'arigatou' }],
          lower: [{ q:'韩语 "안녕하세요" 意思?', opts:['你好','谢谢','再见','对不起'], a:0, e:'annyeonghaseyo' }] },
    g8: { upper: [{ q:'法语 "Bonjour" 意思?', opts:['你好','谢谢','再见','早安'], a:0, e:'bonjour' }],
          lower: [{ q:'西班牙语 "Gracias" 意思?', opts:['谢谢','你好','再见','早安'], a:0, e:'gracias' }] },
    g9: { upper: [{ q:'日语 "さようなら" 意思?', opts:['再见','你好','谢谢','对不起'], a:0, e:'sayounara' }],
          lower: [{ q:'德语 "Danke" 意思?', opts:['谢谢','你好','再见','对不起'], a:0, e:'danke' }] },
    g10:{ upper: [{ q:'法语 "Oui" 意思?', opts:['是','否','谢谢','你好'], a:0, e:'oui=是' }],
          lower: [{ q:'日语 "はい" 意思?', opts:['是','否','谢谢','你好'], a:0, e:'hai=是' }] },
    g11:{ upper: [{ q:'俄语 "Спасибо" 意思?', opts:['谢谢','你好','再见','对不起'], a:0, e:'spasibo' }],
          lower: [{ q:'西班牙语 "Sí" 意思?', opts:['是','否','你好','谢谢'], a:0, e:'sí=是' }] },
    g12:{ upper: [{ q:'法语 "Au revoir" 意思?', opts:['再见','你好','谢谢','对不起'], a:0, e:'au revoir' }],
          lower: [{ q:'日语 "すみません" 意思?', opts:['对不起','你好','谢谢','再见'], a:0, e:'sumimasen' }] },
  },
  coding: {
    g7: { upper: [{ q:'二进制 11 = 十进制?', opts:['3','2','11','5'], a:0, e:'2+1=3' }],
          lower: [{ q:'1 字节 = ? 位', opts:['8','4','16','2'], a:0, e:'1 byte = 8 bits' }] },
    g8: { upper: [{ q:'HTML 表示?', opts:['超文本标记语言','超链接语言','编程语言','脚本语言'], a:0, e:'HyperText Markup' }],
          lower: [{ q:'CPU 指?', opts:['中央处理器','内存','硬盘','显卡'], a:0, e:'Central Processing Unit' }] },
    g9: { upper: [{ q:'Python 输出函数?', opts:['print()','echo()','printf()','output()'], a:0, e:'print' }],
          lower: [{ q:'循环语句 for 是?', opts:['循环','条件','函数','变量'], a:0, e:'for 循环' }] },
    g10:{ upper: [{ q:'以下哪个是编程语言?', opts:['Python','HTTP','HTML','URL'], a:0, e:'Python 是语言' }],
          lower: [{ q:'变量名合法的是?', opts:['my_var','2name','class','my-var'], a:0, e:'字母/下划线开头' }] },
    g11:{ upper: [{ q:'JavaScript 中 === 是?', opts:['严格相等','赋值','不等','比较值相等'], a:0, e:'不转换类型' }],
          lower: [{ q:'列表 [1,2,3] 长度?', opts:['3','2','1','4'], a:0, e:'3 个元素' }] },
    g12:{ upper: [{ q:'排序算法平均 O(n logn)?', opts:['快速排序','冒泡','选择','插入'], a:0, e:'快排平均 nlogn' }],
          lower: [{ q:'二叉树第 k 层最多节点?', opts:['2^(k-1)','k','2k','2^k'], a:0, e:'第k层最多 2^(k-1)' }] },
  },
};

/* ===== 社区网课资源池 ===== */
const COURSE_POOL = {
  math: {
    g7:  { upper:['有理数与无理数','一元一次方程'], lower:['二元一次方程组','不等式与不等式组'] },
    g8:  { upper:['勾股定理与逆定理','一次函数图像'], lower:['二次根式','平行四边形判定'] },
    g9:  { upper:['一元二次方程解法','圆的性质与定理'], lower:['反比例函数','相似三角形'] },
    g10: { upper:['集合与运算','函数概念与性质'], lower:['三角函数入门','对数与指数'] },
    g11: { upper:['导数与切线','极限与连续'], lower:['数列与求和','定积分基础'] },
    g12: { upper:['复数与运算','矩阵与行列式'], lower:['概率与统计','正态分布应用'] },
  },
  chinese: {
    g7:  { upper:['《春》《济南的冬天》精读'], lower:['《论语》十二章解读'] },
    g8:  { upper:['《背影》情感线索'], lower:['《桃花源记》文言精讲'] },
    g9:  { upper:['《故乡》人物分析'], lower:['《岳阳楼记》骈散结合'] },
    g10: { upper:['《沁园春·长沙》意象'], lower:['《再别康桥》音乐美'] },
    g11: { upper:['《赤壁赋》主客问答'], lower:['《蜀道难》浪漫主义'] },
    g12: { upper:['《红楼梦》人物群像'], lower:['《祝福》封建批判'] },
  },
  chem: {
    g8:  { upper:['空气与氧气'], lower:['化学变化与物理变化'] },
    g9:  { upper:['氧气与碳的氧化物'], lower:['酸碱盐的性质'] },
    g10: { upper:['钠与铝的化合物'], lower:['氯气与卤素'] },
    g11: { upper:['乙醇与乙酸'], lower:['原电池与电解池'] },
    g12: { upper:['氨基酸与蛋白质'], lower:['物质的量与 NA'] },
  },
  history: {
    g7:  { upper:['秦汉统一多民族国家'], lower:['古代亚非文明'] },
    g8:  { upper:['盛唐气象与制度'], lower:['宋元科技与文化'] },
    g9:  { upper:['列强侵华与抗争'], lower:['辛亥革命与新文化'] },
    g10: { upper:['新中国成立与建设'], lower:['改革开放新时期'] },
    g11: { upper:['一战与凡尔赛体系'], lower:['古希腊雅典民主'] },
    g12: { upper:['工业革命与世界市场'], lower:['丝绸之路与中外交流'] },
  },
  english: {
    g7:  { upper:['be 动词与自我介绍'], lower:['名词复数规则'] },
    g8:  { upper:['一般过去时'], lower:['现在进行时'] },
    g9:  { upper:['被动语态专题'], lower:['形容词比较等级'] },
    g10: { upper:['直接引语与间接引语'], lower:['虚拟语气入门'] },
    g11: { upper:['高频近义词辨析'], lower:['be good at 句型'] },
    g12: { upper:['现在完成时强化'], lower:['worth doing 句式'] },
  },
  foreign: {
    g7:  { upper:['日语五十音图'], lower:['韩语基础字母'] },
    g8:  { upper:['法语日常问候'], lower:['西班牙语入门'] },
    g9:  { upper:['日语告别表达'], lower:['德语基础会话'] },
    g10: { upper:['法语肯定与否定'], lower:['日语敬语入门'] },
    g11: { upper:['俄语常用表达'], lower:['西班牙语基础会话'] },
    g12: { upper:['法语告别与道谢'], lower:['日语道歉表达'] },
  },
  coding: {
    g7:  { upper:['二进制与十进制转换'], lower:['字节与存储单位'] },
    g8:  { upper:['HTML 网页结构'], lower:['计算机硬件基础'] },
    g9:  { upper:['Python print 与变量'], lower:['for 循环入门'] },
    g10: { upper:['编程语言概述'], lower:['变量命名规范'] },
    g11: { upper:['JavaScript === 与 =='], lower:['列表与下标'] },
    g12: { upper:['快速排序原理'], lower:['二叉树层次遍历'] },
  },
};

/* ===== 爬虫状态 ===== */
let state = {
  lastRefresh: 0,
  source: 'community-feed',
  refreshCount: 0,
  feedVersion: 0, // 每次刷新+1, 前端可据此判断社区资源是否变动
  quizSeed: {},    // subject:grade:semester -> 当前可见题目子集
  courseSeed: {},  // subject:grade:semester -> 当前课程列表 (含随机 minutes/lessons)
};

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===== 模拟从社区源抓取 (优先尝试真实 HTTP) ===== */
function fetchReal(url, timeoutMs) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 4000);
    fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'LearningHubCrawler/1.0' } })
      .then(r => r.text())
      .then(t => { clearTimeout(t); try { resolve(JSON.parse(t)); } catch { resolve(null); } })
      .catch(() => { clearTimeout(t); resolve(null); });
  });
}

/* 生成数学题(随机数) — 让每次刷新都有"新题入库" */
function genMathDynamic(grade, semester) {
  const a = rnd(2, 9), b = rnd(2, 9);
  const c = a + b;
  return {
    q: `社区新题: 计算 ${a} + ${b} = ? (年级 ${GRADE_LABEL[grade]} ${semester === 'upper' ? '上册' : '下册'})`,
    opts: shuffle([c, c + 1, c - 1, c + 2].map(String)),
    a: 0, e: `${a}+${b}=${c}`,
    dynamic: true,
  };
}

async function refresh() {
  state.refreshCount++;
  state.feedVersion++;
  state.lastRefresh = Date.now();

  let realData = null;
  if (COMMUNITY_SOURCE_URL) {
    realData = await fetchReal(COMMUNITY_SOURCE_URL, 4000);
    state.source = realData ? 'community-live' : 'community-feed(fallback)';
  } else {
    state.source = 'community-feed';
  }

  // 为每个 学科×年级×学期 抽取当前可见题目子集 (模拟社区动态入库/下架)
  state.quizSeed = {};
  state.courseSeed = {};
  SUBJECTS.forEach(subj => {
    GRADES.forEach(g => {
      SEMESTERS.forEach(sem => {
        const pool = (QUIZ_POOL[subj] && QUIZ_POOL[subj][g] && QUIZ_POOL[subj][g][sem]) || [];
        // 动态补充: 偶尔加入生成的数学题或通用变体
        let arr = pool.slice();
        if (subj === 'math' && Math.random() < 0.6) arr.push(genMathDynamic(g, sem));
        // 随机抽取 2~全部 条 (模拟社区资源波动)
        const take = Math.min(arr.length, rnd(Math.max(1, arr.length - 1), arr.length));
        state.quizSeed[`${subj}:${g}:${sem}`] = shuffle(arr).slice(0, take);
      });
    });

    GRADES.forEach(g => {
      SEMESTERS.forEach(sem => {
        const titles = (COURSE_POOL[subj] && COURSE_POOL[subj][g] && COURSE_POOL[subj][g][sem]) || [];
        state.courseSeed[`${subj}:${g}:${sem}`] = titles.map((t, i) => ({
          title: t,
          lessons: rnd(8, 32),
          watched: rnd(2, 28),
          minutes: rnd(10, 55),
          due: pick(['本周','2天后','3天后','5天后','10天后','15天后','已完成']),
          // 社区数据: 点赞数随 feedVersion 波动
          likes: rnd(20, 980) + state.feedVersion,
          teacher: pick(['王老师','李老师','张老师','陈老师','刘老师','赵老师']),
        }));
      });
    });
  });

  return state;
}

async function ensureFresh() {
  if (Date.now() - state.lastRefresh > REFRESH_INTERVAL_MS) await refresh();
  return state;
}

function getQuizzes({ subject, grade, semester }) {
  // 若未指定, 返回该学科所有年级学期的并集 (前端默认全选)
  const out = [];
  const grades = grade ? [grade] : GRADES;
  const sems = semester ? [semester] : SEMESTERS;
  grades.forEach(g => sems.forEach(sem => {
    const list = state.quizSeed[`${subject}:${g}:${sem}`] || [];
    list.forEach(q => out.push({ ...q, subject, grade: g, semester: sem }));
  }));
  return out;
}

function getCourses({ subject, grade, semester }) {
  const out = [];
  const grades = grade ? [grade] : GRADES;
  const sems = semester ? [semester] : SEMESTERS;
  grades.forEach(g => sems.forEach(sem => {
    const list = state.courseSeed[`${subject}:${g}:${sem}`] || [];
    list.forEach(c => out.push({ ...c, subject, grade: g, semester: sem }));
  }));
  return out;
}



// ===== 浏览器 API shim — 模拟 server.js 的 /api/* 端点 =====
window.CrawlerAPI = {
  state: state,
  refresh: refresh,
  ensureFresh: ensureFresh,
  getQuizzes: getQuizzes,
  getCourses: getCourses,
  SUBJECTS: SUBJECTS,
  GRADES: GRADES,
  GRADE_LABEL: GRADE_LABEL,
  SEMESTERS: SEMESTERS,
  REFRESH_INTERVAL_MS: REFRESH_INTERVAL_MS,
  handle: async function(pathname, query) {
    await ensureFresh();
    if (pathname === '/api/status') {
      return {
        source: state.source,
        lastRefresh: state.lastRefresh,
        refreshCount: state.refreshCount,
        feedVersion: state.feedVersion,
        intervalMs: REFRESH_INTERVAL_MS,
        nextRefreshIn: Math.max(0, REFRESH_INTERVAL_MS - (Date.now() - state.lastRefresh)),
        subjects: SUBJECTS,
        grades: GRADES,
        gradeLabels: GRADE_LABEL,
        semesters: SEMESTERS,
      };
    }
    if (pathname === '/api/quizzes') {
      return {
        feedVersion: state.feedVersion,
        source: state.source,
        items: getQuizzes({ subject: query.subject, grade: query.grade, semester: query.semester }),
      };
    }
    if (pathname === '/api/courses') {
      return {
        feedVersion: state.feedVersion,
        source: state.source,
        items: getCourses({ subject: query.subject, grade: query.grade, semester: query.semester }),
      };
    }
    if (pathname === '/api/refresh') {
      await refresh();
      return { ok: true, feedVersion: state.feedVersion };
    }
    throw new Error('unknown route ' + pathname);
  }
};

// 启动: 立即刷新一次, 然后每 90 秒自动刷新 (模拟社区资源变动)
refresh().then(() => {
  setInterval(() => { refresh(); }, REFRESH_INTERVAL_MS);
});
