import test from 'node:test';
import assert from 'node:assert/strict';
import { screenshotSource } from '../../pulsefx/icloud/screenshots.mjs';
import { mapSnapshot } from '../../pulsefx/icloud/mapper.mjs';
import { sample, zone } from './fixtures.mjs';
test('Screenshots accept Apple assets and reject foreign, executable and credential URLs', () => {
  const src = url => screenshotSource({ CD_data_ckAsset: { value: { downloadURL: url } } });
  assert.equal(src('https://assets.icloud-content.com/image'), 'https://assets.icloud-content.com/image');
  for (const url of ['https://evil.test/image', 'https://icloud.com.evil.test/image', 'javascript:alert(1)', 'https://u:p@assets.icloud.com/x']) assert.equal(src(url), null);
});
test('Screenshots link within the same zone and retain annotation warning without modifying data', () => {
  const input = sample();
  input.records.push({ recordType: 'CD_TradeScreenshot', recordName: 'image', zoneID: zone, fields: { CD_trade: { value: 'modern-b1' }, CD_data: { value: 'iVBORw0KGgo=' }, CD_annotationData: { value: 'drawing' } } });
  const before = structuredClone(input);
  const mapped = mapSnapshot(input);
  assert.equal(mapped.screenshots[0].tradeKey, mapped.trades.find(t => t.recordName === 'modern-b1').key);
  assert.equal(mapped.screenshots[0].annotated, true);
  assert.match(mapped.screenshots[0].src, /^data:image\/png/);
  assert.deepEqual(input, before);
  input.records.at(-1).zoneID = { ...zone, zoneName: 'Other' };
  assert.equal(mapSnapshot(input).screenshots[0].tradeKey, null);
});
