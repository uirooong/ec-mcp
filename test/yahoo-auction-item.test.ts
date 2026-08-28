import assert from 'node:assert/strict';
import test from 'node:test';
import { buildItemDetail, normalizeAuctionId } from '../src/providers/yahoo-auction/item.ts';

test('normalizeAuctionId accepts raw ids and auction URLs', () => {
  assert.equal(normalizeAuctionId('o1240869945'), 'o1240869945');
  assert.equal(normalizeAuctionId('1240869945'), '1240869945');
  assert.equal(normalizeAuctionId('https://auctions.yahoo.co.jp/jp/auction/x1236553240'), 'x1236553240');
  assert.equal(normalizeAuctionId('https://page.auctions.yahoo.co.jp/jp/auction/k1230794012?foo=1'), 'k1230794012');
  assert.equal(normalizeAuctionId('https://auctions.yahoo.co.jp/jp/show/qanda?aID=o1240869945'), 'o1240869945');
  assert.throws(() => normalizeAuctionId('not an auction'), /Invalid Yahoo! Auctions ID/);
});

// Shape taken from a live /api/detail/v2/items/{id} response.
const rawDetail = {
  auctionId: 'o1240869945',
  title: '1円スタート iPhone 17 256GB',
  description: ['海外SIM対応', 'バッテリー100%'],
  price: 136000,
  initPrice: 1,
  bidorbuy: 0,
  bids: 109,
  biddersNum: 13,
  watchListNum: 43,
  quantity: 1,
  status: 'open',
  startTime: '2026-08-23T19:23:36+09:00',
  endTime: '2026-08-30T21:23:36+09:00',
  leftTime: 208584.684,
  conditionName: '目立った傷や汚れなし',
  category: {
    path: [
      { id: '0', name: 'オークション' },
      { id: '23632', name: '家電、AV、カメラ' },
      { id: '2084317599', name: 'iPhone' },
      { id: '2084317599', name: 'iPhone' } // duplicate must be dropped
    ]
  },
  brand: { path: [{ id: '100011', name: 'Apple' }, { id: '116244', name: 'iPhone' }] },
  img: [{ image: 'https://img.test/1.jpg' }, { image: 'https://img.test/2.jpg' }],
  chargeForShipping: 'winner',
  shipScheduleName: '支払い手続き完了から1〜2日で発送',
  shipping: { methods: [{ id: 'JP_YUPACKET_PLUS', name: 'おてがる配送ゆうパケットプラス' }] },
  seller: {
    aucUserId: 'SELLER1',
    isStore: false,
    rating: { goodRating: '96.7%', summary: 286, ult: { goodPoint: 296, badPoint: 10, allPoint: 286 } }
  },
  answeredQAndANum: 2,
  unAnsweredQAndANum: 1,
  isFleaMarket: false,
  auctionItemUrl: 'https://auctions.yahoo.co.jp/jp/auction/o1240869945'
};

test('buildItemDetail normalizes auction pricing, bids and timing', () => {
  const detail = buildItemDetail(rawDetail, 'o1240869945');
  assert.equal(detail.id, 'o1240869945');
  assert.equal(detail.current_price, 136000);
  assert.equal(detail.starting_price, 1);
  // bidorbuy of 0 means "no buy-it-now", not a zero-yen buy-it-now.
  assert.equal(detail.buy_now_price, null);
  assert.equal(detail.has_buy_now, false);
  assert.equal(detail.currency, 'JPY');
  assert.equal(detail.bid_count, 109);
  assert.equal(detail.bidders_count, 13);
  assert.equal(detail.watch_count, 43);
  assert.equal(detail.quantity, 1);
  assert.equal(detail.status, 'open');
  assert.equal(detail.remaining_seconds, 208584); // provider countdown, floored
  assert.equal(detail.description, '海外SIM対応\nバッテリー100%');
  assert.deepEqual(detail.photos, ['https://img.test/1.jpg', 'https://img.test/2.jpg']);
  assert.deepEqual(detail.category.map(tier => tier.id), ['0', '23632', '2084317599']);
  assert.deepEqual(detail.brand_names, ['Apple', 'iPhone']);
  assert.equal(detail.condition_name, '目立った傷や汚れなし');
  assert.equal(detail.shipping_payer, 'winner');
  assert.deepEqual(detail.shipping_methods, ['おてがる配送ゆうパケットプラス']);
  assert.equal(detail.seller?.good_rating_count, 296);
  assert.equal(detail.seller?.bad_rating_count, 10);
  assert.equal(detail.questions_count, 3);
});

test('buildItemDetail exposes a real buy-it-now price when present', () => {
  const detail = buildItemDetail({ ...rawDetail, bidorbuy: 1272 }, 'k1230794012');
  assert.equal(detail.buy_now_price, 1272);
  assert.equal(detail.has_buy_now, true);
});

test('buildItemDetail derives status from endTime when status is absent', () => {
  const past = { ...rawDetail, status: undefined, leftTime: undefined, endTime: '2020-01-01T00:00:00+09:00' };
  const detail = buildItemDetail(past, 'o1');
  assert.equal(detail.status, 'closed');
  assert.equal(detail.remaining_seconds, 0);
});

test('buildItemDetail tolerates a sparse payload', () => {
  const detail = buildItemDetail({ auctionId: 'x1', title: 't' }, 'x1');
  assert.equal(detail.current_price, 0);
  assert.equal(detail.description, null);
  assert.deepEqual(detail.photos, []);
  assert.equal(detail.seller, null);
  assert.equal(detail.url, 'https://auctions.yahoo.co.jp/jp/auction/x1');
});
