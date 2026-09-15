import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const math = require('../js/dashboard-chart-math.js');

const blocks = [
  { sourceIndex: 0, instructional_days: 10, instructional_days_elapsed: 10, is_complete: true },
  { sourceIndex: 1, instructional_days: 10, instructional_days_elapsed: 4, is_current: true },
  { sourceIndex: 2, instructional_days: 5, instructional_days_elapsed: 0 },
];

test('pace uses actual uploaded instructional-day counts', () => {
  assert.equal(math.totalInstructionalDays(blocks), 25);
  assert.equal(math.paceDayFraction(blocks, blocks[0], 'full'), 0.4);
  assert.equal(math.paceDayFraction(blocks, blocks[1], 'full'), 0.8);
  assert.equal(math.paceDayFraction(blocks, blocks[2], 'full'), 1);
  assert.equal(math.paceDayFraction(blocks, blocks[1], 'ytd'), 14 / 25);
});

test('pace endpoints match requested distributions', () => {
  assert.equal(math.paceEndpoint(60, 3), 180);
  assert.equal(math.paceEndpoint(60, 2.75), 165);
  assert.equal(math.paceEndpoint(60, 3.25), 195);
});

test('approved calendar and A/B/C/D paths use raw 3N goals', () => {
  const bundle=JSON.parse(fs.readFileSync(new URL('../data/competencies-2026.json', import.meta.url),'utf8'));
  const days=bundle.calendar.days.filter(d=>d.instructional);
  assert.equal(days.length,171);
  assert.equal(days[0].date,'2026-09-14');
  assert.equal(days.at(-1).date,'2027-06-10');
  for (const date of ['2026-10-12','2026-11-11','2026-11-26','2026-11-27','2026-12-21','2027-01-01','2027-01-18','2027-02-12','2027-02-15','2027-04-05','2027-04-09','2027-05-31']) assert(!days.some(d=>d.date===date),date);
  for (const [level,N] of [[1,89],[2,91],[3,91]]) {
    const targets=bundle.courses[level-1].competencies.reduce((n,c)=>n+Math.max(1,c.elements.length)*c.modes.length,0);
    assert.equal(targets,N);
    for (const p of [1,.83,.73,.63,.60]) {
      assert(Math.abs(math.paceEndpoint(N,3*p)-3*N*p)<1e-10);
      assert(Math.abs(math.paceEndpoint(N,3*p)*10/171 - p*3*N*10/171)<1e-10);
    }
  }
  assert.equal((4+2)/(3*2)*100,100,'a 4 offsets a 2');
  assert(4/3*100>100,'raw scores may exceed 100%');
});
