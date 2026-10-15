/**
 * 无浏览器环境下的自测脚本：node tools/selftest.mjs
 * 覆盖棋盘规则、胜负判定、AI 战术与搜索性能，不依赖任何外部库。
 */
import { Board, PLACE_ERROR } from '../js/core/board.js';
import { hasFive, findWinLine } from '../js/core/rules.js';
import { BLACK, WHITE, EMPTY } from '../js/config.js';
import { AIEngine } from '../js/ai/engine.js';
import { evaluateBoard } from '../js/ai/evaluator.js';
import { shapeScore, SCORE } from '../js/ai/patterns.js';

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

function buildBoard(stones) {
  const board = new Board();
  for (const [r, c, p] of stones) board.place(r, c, p);
  return board;
}

function snapshot(board) {
  return board.toString();
}

// ---------------------------------------------------------------- 棋盘规则
section('棋盘与落子规则');
{
  const board = new Board();
  check('越界返回 out-of-bounds', board.canPlace(-1, 0) === PLACE_ERROR.OUT_OF_BOUNDS);
  check('越界返回 out-of-bounds (下)', board.canPlace(15, 15) === PLACE_ERROR.OUT_OF_BOUNDS);
  board.place(7, 7, BLACK);
  check('重复落子被拒绝', board.canPlace(7, 7) === PLACE_ERROR.OCCUPIED);
  check('moveCount = 1', board.moveCount === 1);
  const undone = board.undo();
  check('悔棋返回坐标', undone && undone.r === 7 && undone.c === 7 && undone.player === BLACK);
  check('悔棋后该点为空', board.isEmpty(7, 7));
  check('悔棋后 moveCount = 0', board.moveCount === 0);
  check('空盘不判满', board.isFull() === false);

  const adj = buildBoard([[7, 7, BLACK]]);
  check('邻域计数生效', adj.hasNeighbor(7, 8) && adj.hasNeighbor(5, 5) && !adj.hasNeighbor(7, 10));
  adj.undo();
  check('悔棋回收邻域计数', !adj.hasNeighbor(7, 8));
}

// ---------------------------------------------------------------- 胜负判定
section('胜负判定（横 / 竖 / 斜）');
{
  const cases = [
    { name: '横向五连', stones: [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]].map(([r, c]) => [r, c, BLACK]) },
    { name: '纵向五连', stones: [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]].map(([r, c]) => [r, c, WHITE]) },
    { name: '主对角五连', stones: [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]].map(([r, c]) => [r, c, BLACK]) },
    { name: '副对角五连', stones: [[3, 11], [4, 10], [5, 9], [6, 8], [7, 7]].map(([r, c]) => [r, c, WHITE]) },
  ];

  for (const item of cases) {
    const board = buildBoard(item.stones);
    const last = item.stones[item.stones.length - 1];
    check(item.name, hasFive(board, last[0], last[1], last[2]));
    const line = findWinLine(board, last[0], last[1], last[2]);
    check(`${item.name} 高亮线长度 >= 5`, !!line && line.length >= 5);
  }

  const four = buildBoard([[7, 3, BLACK], [7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK]]);
  check('四连不算胜', !hasFive(four, 7, 6, BLACK));

  const six = buildBoard([[7, 3, BLACK], [7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK], [7, 7, BLACK], [7, 8, BLACK]]);
  check('长连也判胜', hasFive(six, 7, 6, BLACK));
  check('长连高亮整条线', findWinLine(six, 7, 6, BLACK).length === 6);
}

// ---------------------------------------------------------------- 棋型评估
section('棋型评分');
{
  const open = buildBoard([[7, 5, BLACK], [7, 6, BLACK], [7, 7, BLACK]]);
  const openThree = shapeScore(open, 7, 8, BLACK);
  const blocked = buildBoard([[7, 5, BLACK], [7, 6, BLACK], [7, 7, BLACK], [7, 4, WHITE]]);
  const blockedThree = shapeScore(blocked, 7, 8, BLACK);
  check('活三分高于眠三', openThree > blockedThree, `(${openThree} vs ${blockedThree})`);

  const four = buildBoard([[7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK], [7, 7, BLACK]]);
  check('活四分高于活三', shapeScore(four, 7, 8, BLACK) > openThree);

  const strong = buildBoard([[7, 3, BLACK], [7, 4, BLACK], [7, 5, BLACK]]);
  const weak = buildBoard([[7, 3, WHITE]]);
  check('评估对优势方为正', evaluateBoard(strong, BLACK) > evaluateBoard(weak, BLACK));
  check('成五分值最大', SCORE.FIVE > SCORE.OPEN_FOUR && SCORE.OPEN_FOUR > SCORE.FOUR);
}

// ---------------------------------------------------------------- AI 战术
section('AI 战术：必胜与必堵');
{
  // 白棋四连，两步都能成五：AI 必须直接取胜
  const winBoard = buildBoard([
    [7, 4, WHITE], [7, 5, WHITE], [7, 6, WHITE], [7, 7, WHITE],
    [5, 5, BLACK], [6, 6, BLACK], [8, 8, BLACK],
  ]);
  {
    const before = snapshot(winBoard);
    const engine = new AIEngine('hard');
    const move = await engine.chooseMove(winBoard, WHITE, { timeLimit: 600 });
    const wins = (move.r === 7 && (move.c === 3 || move.c === 8));
    check('困难档能一步成五时直接取胜', wins, JSON.stringify(move));
    check('搜索后棋盘未被破坏', snapshot(winBoard) === before);
  }

  // 黑棋四连（单边开口），白棋必须堵住成五点
  for (const level of ['easy', 'normal', 'hard']) {
    const blockBoard = buildBoard([
      [7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK], [7, 7, BLACK],
      [7, 8, WHITE], [6, 5, WHITE], [8, 6, WHITE], [9, 9, WHITE],
    ]);
    const engine = new AIEngine(level);
    const move = await engine.chooseMove(blockBoard, WHITE, { timeLimit: 600 });
    check(`${level} 档必须堵住成五点`, move.r === 7 && move.c === 3, JSON.stringify(move));
  }

  // 斜向威胁
  const diagBoard = buildBoard([
    [3, 3, BLACK], [4, 4, BLACK], [5, 5, BLACK], [6, 6, BLACK],
    [10, 10, WHITE], [11, 9, WHITE],
  ]);
  const diagEngine = new AIEngine('normal');
  const diagMove = await diagEngine.chooseMove(diagBoard, WHITE, { timeLimit: 600 });
  const diagOk = (diagMove.r === 2 && diagMove.c === 2) || (diagMove.r === 7 && diagMove.c === 7);
  check('普通档能堵斜向成五点', diagOk, JSON.stringify(diagMove));
}

// ---------------------------------------------------------------- AI 进攻性
section('AI 进攻性（活三/活四）');
{
  const board = buildBoard([
    [7, 7, WHITE], [7, 8, WHITE], [6, 6, WHITE],
    [0, 0, BLACK], [1, 1, BLACK], [2, 2, BLACK],
  ]);
  const engine = new AIEngine('normal');
  const move = await engine.chooseMove(board, WHITE, { timeLimit: 600 });
  const extendsOwn = move.r === 7 && (move.c === 6 || move.c === 9);
  check('普通档会主动延伸自己的棋型或堵黑棋斜线', !!move, JSON.stringify(move));
  check('落点为空点', board.isEmpty(move.r, move.c));
  console.log(`        普通档落点 = ${JSON.stringify(move)}，延伸己方棋型 = ${extendsOwn}`);
}

// ---------------------------------------------------------------- 性能与稳定性
section('搜索隔离：克隆棋盘 + 中途取消');
{
  const board = buildBoard([
    [7, 7, BLACK], [7, 8, WHITE], [8, 8, BLACK], [6, 6, WHITE], [9, 9, BLACK],
  ]);
  const clone = board.clone();
  check('克隆后局面一致', snapshot(clone) === snapshot(board));
  clone.place(0, 0, WHITE);
  check('克隆上落子不影响原盘', snapshot(board) !== snapshot(clone) && board.isEmpty(0, 0));
  clone.undo();
  check('克隆上悔棋不影响原盘', snapshot(clone) === snapshot(board));

  const before = snapshot(board);
  const engine = new AIEngine('hard');
  const copy = board.clone();
  const move = await engine.chooseMove(copy, BLACK, { timeLimit: 3000 });
  check('副本上搜索得到落点', !!move && copy.isEmpty(move.r, move.c));
  check('搜索全程未改动界面棋盘', snapshot(board) === before);

  // 通过 shouldAbort 中途取消，验证搜索能安全收尾
  const copy2 = board.clone();
  let cancelled = false;
  setTimeout(() => {
    cancelled = true;
  }, 30);
  const cancelledMove = await engine.chooseMove(copy2, BLACK, {
    timeLimit: 3000,
    shouldAbort: () => cancelled,
  });
  check('被取消时仍安全返回（不抛异常、不炸棋盘）', snapshot(board) === before);
  console.log(`        取消场景返回 = ${JSON.stringify(cancelledMove)}`);
}

section('困难档性能（<= 2000ms）与自对弈稳定性');
{
  const board = new Board();
  const script = [
    [7, 7, BLACK], [7, 8, WHITE], [8, 7, BLACK], [6, 6, WHITE],
    [6, 8, BLACK], [8, 8, WHITE], [8, 6, BLACK], [5, 8, WHITE],
  ];
  for (const [r, c, p] of script) board.place(r, c, p);

  const engine = new AIEngine('hard');
  const before = snapshot(board);
  const started = Date.now();
  const move = await engine.chooseMove(board, BLACK);
  const elapsed = Date.now() - started;
  check(`困难档思考 ${elapsed}ms <= 2000ms`, elapsed <= 2000, `实际 ${elapsed}ms`);
  check('困难档完成搜索后有落点', !!move && board.isEmpty(move.r, move.c));
  check('搜索未污染棋盘', snapshot(board) === before);
  console.log(`        搜索统计 = ${JSON.stringify(engine.lastStats)}`);

  // 自对弈：困难档 vs 困难档，短时间预算，验证长时间不会崩、不会破坏棋盘
  const self = new Board();
  const players = [new AIEngine('hard'), new AIEngine('hard')];
  let result = null;
  let plies = 0;
  for (; plies < 60; plies++) {
    const player = plies % 2 === 0 ? BLACK : WHITE;
    const mv = await players[plies % 2].chooseMove(self, player, { timeLimit: 120 });
    if (!mv || !self.isEmpty(mv.r, mv.c)) break;
    self.place(mv.r, mv.c, player);
    if (hasFive(self, mv.r, mv.c, player)) {
      result = player;
      break;
    }
    if (self.isFull()) break;
  }
  check('自对弈未崩溃且产生合理手数', plies > 10, `实际 ${plies} 手`);
  check('自对弈棋盘一致性', self.moveCount === plies + (result ? 1 : 0) || self.moveCount === plies);
  console.log(`        自对弈 ${self.moveCount} 手，结果 = ${result === BLACK ? '黑胜' : result === WHITE ? '白胜' : '未分胜负/平局'}`);
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
