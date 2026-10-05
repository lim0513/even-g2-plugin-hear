// node test/fake-japanese.mjs
//
// **日本語のつもりの文字列に中国語が混ざっていないか。**
//
// 実際に混ざった（実測で指摘された）：
//   - 「収藏」…… 日本語は「お気に入り」。そもそも「藏」は日本語の字ではない（蔵）
//   - 「この插件」…… 日本語なら「このアプリ」
//   - 「下车」…… 日本語は「降車」
//
// 三言語を一つの表に並べて書いていると、隣の欄に引きずられてこうなる。
// **目視では見つからない** —— 日本語話者でなければ違和感が出ないし、
// 字の形が似ているので読み飛ばす。だから機械で見る。
//
// 見方は二層：
//   1. **簡体字専用の字**。共有字を入れると偽陽性だらけになる ——
//      置・情・点 を入れて「位置」「情報」「終点」まで誤検出した。
//   2. **字はどれも日本語なのに、語として中国語**。
//      「手机」の机は「つくえ」、「插件」の件も日本語の字。字だけでは捕まらない。
//
// **どこを見るか**が同じくらい難しい。二度外した：
//
//   - **行を丸ごと見た。**i18n.ts は
//         'g.pickFav': { ja: 'お気に入りから出発', en: '...', zh: '从收藏出发' },
//     と三言語を一行に並べる。行全体で見ると zh の中国語が ja の欄の混入として
//     出てしまい、39 行が一斉に引っかかって本物が埋もれた。**ja: の値だけを見る。**
//   - **仮名が一つでもあれば日本語、とした。**この工程のコメントは中国語で
//     書いてあるものが多く、その中で「内回り」「のりば」のような日本語の語を
//     引用する。**引用は事故ではない。**仮名の密度で絞る。

import fs from 'node:fs'
import path from 'node:path'

/** 日本語では使わない字（簡体字専用）。共有字は**入れない** */
const CN_CHARS = [...'车站线时钟选择请运换开关达发电现显设语详细结还这个为么们图东门铁头说谢让订认边过进远术华汉乘长终话给带输络网练习复击藏应该单确种类码插欢迎间'];

/** 字はどれも日本語なのに、語として中国語のもの */
const CN_WORDS = [
  '插件', '手机', '眼镜', '车站', '班次', '线路', '时刻表', '分钟', '收藏',
  '信息', '运行', '设置', '选择', '换乘', '下车', '上车', '现在', '结束', '地图',
];

// **仮名そのものだけ。**「・」(U+30FB) と「ー」(U+30FC) は片仮名ブロックに
// 入っているが仮名ではない —— これを含めると「JR京浜東北線・根岸線」のような
// 純粋な中国語のコメントまで「日本語の行」と見なしてしまう（実測でそうなった）。
const KANA = /[ぁ-ゖァ-ヺ]/;
const HAN = /[一-鿿]/;

/**
 * この行の地の文は日本語か。
 *
 * 日本語なら助詞と活用で仮名が多くなり、中国語の地の文に日本語の語を
 * 引用しただけなら仮名は低いまま。その差で分ける。
 */
function looksJapanese(line) {
  const kana = [...line].filter((c) => KANA.test(c)).length;
  const han = [...line].filter((c) => HAN.test(c)).length;
  return kana > 0 && kana / (kana + han) >= 0.25;
}

/**
 * 三言語表の行から ja の値だけを取り出す。表でなければ null。
 * demo-feed.ts は { src: '日本語', dst: '中文' } の形なので src: も同じ扱い
 */
function jaValue(line) {
  const m = /\b(?:ja|src):\s*'((?:[^'\\]|\\.)*)'/.exec(line)
    || /\b(?:ja|src):\s*"((?:[^"\\]|\\.)*)"/.exec(line);
  return m ? m[1] : null;
}

/** 一行のうち「日本語のつもりの部分」。無ければ空 */
function japanesePart(line) {
  const ja = jaValue(line);
  if (ja !== null) return ja;            // 隣の欄（en/zh）は混入ではない
  return looksJapanese(line) ? line : '';
}

export function fakeJapanese(text) {
  const chars = [...new Set([...text].filter((c) => CN_CHARS.includes(c)))];
  const words = CN_WORDS.filter((w) => text.includes(w));
  return [...chars, ...words];
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
));

// index.html も見る —— CSS のコメントにも同じ混ざり方をしていた
const FILES = [...walk('src').filter((f) => f.endsWith('.ts')), 'index.html'];

let bad = 0;
for (const file of FILES) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const part = japanesePart(line);
    if (!part) return;
    const hit = fakeJapanese(part);
    if (!hit.length) return;
    bad++;
    console.log(`  ${file}:${i + 1}`);
    console.log(`     ${part.trim().slice(0, 78)}`);
    console.log(`     ← ${hit.join(' ')}`);
  });
}

console.log(bad
  ? `\n  FAIL  日本語のつもりの箇所に中国語が ${bad} 件`
  : '  PASS  日本語のつもりの箇所に中国語の混入なし');
process.exit(bad ? 1 : 0);
