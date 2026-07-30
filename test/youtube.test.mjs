import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVttText, _parseVttTime, _extractPlayerResponse, buildSubtitleUrl } from "../src/api/youtube.js";

test("parseVttText：解析标准 WebVTT 块", () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.500
hello world

00:00:02.500 --> 00:00:05.000
this is <c.colorE5E5E5>a test</c>
`;
  const segs = parseVttText(vtt);
  assert.ok(Array.isArray(segs), "应返回 segments 数组");
  assert.equal(segs.length, 2);
  assert.equal(segs[0].from, 0);
  assert.equal(segs[0].to, 2.5);
  assert.equal(segs[0].content, "hello world");
  // 内联标签应被剥离
  assert.ok(!segs[1].content.includes("<"), segs[1].content);
  assert.equal(segs[1].from, 2.5);
  assert.equal(segs[1].to, 5);
});

test("parseVttText：短时间格式 mm:ss.ddd 也支持", () => {
  const vtt = `WEBVTT

00:01.000 --> 00:03.500
short form
`;
  const segs = parseVttText(vtt);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].from, 1);
  assert.equal(segs[0].to, 3.5);
});

test("parseVttText：空文本与非 VTT 返回 null（触发 json3 失败回退）", () => {
  assert.equal(parseVttText(""), null);
  assert.equal(parseVttText("   "), null);
  // consent 重定向 HTML 不应被误判为 VTT
  assert.equal(parseVttText("<!DOCTYPE html><html><head><title>Consent</title></head></html>"), null);
  // 默认 srv3 XML 不应被误判
  assert.equal(parseVttText('<?xml version="1.0"?><timedtext>...'), null);
});

test("_parseVttTime：HH:MM:SS 与 mm:ss.ms 互通", () => {
  assert.equal(_parseVttTime("00:00:00.000"), 0);
  assert.equal(_parseVttTime("01:02.345"), 62.345);
  assert.equal(_parseVttTime("1:02.345"), 62.345);
  assert.equal(_parseVttTime("00:01:02.500"), 62.5);
  // 逗号分隔符（部分 YouTube VTT 用 , 而非 .）
  assert.equal(_parseVttTime("00:01:02,500"), 62.5);
});

test("_extractPlayerResponse：从 watch HTML 抠出内嵌 JSON", () => {
  const fakeJson = '{"videoDetails":{"title":"Demo","defaultAudioTrackLanguage":"en"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://x/sub","languageCode":"en","kind":"asr"}]}}}';
  const html = `<!doctype html><html><script>var ytInitialPlayerResponse = ${fakeJson};</script></html>`;
  const p = _extractPlayerResponse(html);
  assert.ok(p, "应解析出 player 对象");
  assert.equal(p.videoDetails.title, "Demo");
  assert.equal(p.captions.playerCaptionsTracklistRenderer.captionTracks[0].languageCode, "en");
});

test("_extractPlayerResponse：缺失/坏 JSON 返回 null 而非抛错", () => {
  assert.equal(_extractPlayerResponse("<html></html>"), null);
  // 截断的 JSON 不应抛
  const html = `x ytInitialPlayerResponse = {"a":{"b":`;
  assert.equal(_extractPlayerResponse(html), null);
});

test("buildSubtitleUrl：删除 baseUrl 原有 fmt 再设置，避免多值冲突", () => {
  // baseUrl 自带 fmt=srv3（YouTube 常见情况），追加 fmt=json3 应替换而非并存
  const base = "https://www.youtube.com/api/timedtext?v=ABC&lang=en&fmt=srv3&kind=asr";
  const out = buildSubtitleUrl(base, "json3");
  const u = new URL(out);
  const fmts = u.searchParams.getAll("fmt");
  assert.equal(fmts.length, 1, "fmt 参数应唯一，不允许多值冲突");
  assert.equal(fmts[0], "json3");
  // 其它参数应保留
  assert.equal(u.searchParams.get("v"), "ABC");
  assert.equal(u.searchParams.get("lang"), "en");
  assert.equal(u.searchParams.get("kind"), "asr");
});

test("buildSubtitleUrl：tlang 正确追加", () => {
  const base = "https://www.youtube.com/api/timedtext?v=ABC&lang=en";
  const out = buildSubtitleUrl(base, "vtt", "zh-Hans");
  const u = new URL(out);
  assert.equal(u.searchParams.get("fmt"), "vtt");
  assert.equal(u.searchParams.get("tlang"), "zh-Hans");
});

test("buildSubtitleUrl：无 fmt 参数时正常追加", () => {
  const base = "https://www.youtube.com/api/timedtext?v=ABC";
  const out = buildSubtitleUrl(base, "json3");
  assert.ok(out.includes("fmt=json3"));
});