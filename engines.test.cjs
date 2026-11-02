const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMindGrid() {
  const appPath = path.join(__dirname, '..', 'app.js');
  let source = fs.readFileSync(appPath, 'utf8');
  const marker = '  saveProfile();\n  renderHome();\n})();';
  assert.ok(source.includes(marker), 'test access hook marker exists');
  const hook = `
  if (window.__MINDGRID_TEST_MODE__) {
    window.__MINDGRID_TEST_API__ = {
      sudoku, startSudoku, solveSudoku, makeSudokuPuzzle, setSudokuValue,
      connect, resetConnect, connectBestMove, connectWin, connectDrop,
      playConnect,
      queens, queenSearch, queenSafe, placeQueen,
      game2048, reset2048, apply2048, heuristic2048, best2048, slide2048, auto2048,
      runBenchmarks, renderHome, renderSudoku, renderConnect, renderQueens,
      render2048, renderBenchmarks, route
    };
  }
`;
  source = source.replace(marker, hook + marker);
  const listeners = {};
  const element = () => ({
    innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, callback) { this[`on${type}`] = callback; }
  });
  const elements = new Map([
    ['#view', element()], ['#toast', element()], ['#sidebar-solved', element()],
    ['#crumb-current', element()], ['#help-button', element()], ['#modal-root', element()]
  ]);
  const document = {
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll() { return []; },
    addEventListener(type, callback) { listeners[type] = callback; }
  };
  const storage = new Map();
  const window = { __MINDGRID_TEST_MODE__: true };
  const context = {
    document, window, performance, Math, Date,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); }
    },
    setTimeout, clearTimeout
  };
  vm.runInNewContext(source, context, { filename: appPath });
  return { api: window.__MINDGRID_TEST_API__, view: elements.get('#view'), listeners };
}
function dispatchClick(listeners, matches) {
  const event={target:{closest(selector){return matches[selector]||null;}},preventDefault(){}};
  listeners.click(event);
}

test('arcade shell renders and route changes show each game screen', () => {
  const { api, view } = loadMindGrid();
  assert.match(view.innerHTML, /Choose your challenge/);
  for (const [screen, title] of [['sudoku','Sudoku'],['connect','Connect Four'],['queens','N-Queens Tour'],['2048','2048'],['benchmarks','Benchmarks']]) {
    api.route(screen);
    assert.match(view.innerHTML, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Sudoku generator produces a valid unique puzzle at all difficulty levels', () => {
  const { api } = loadMindGrid();
  for (const [difficulty, removals] of [['Easy',35],['Medium',43],['Hard',50]]) {
    api.startSudoku(difficulty);
    const { board, givens, solution } = api.sudoku;
    assert.equal(solveWithMasks(api.solveSudoku, board).count, 1, `${difficulty} puzzle has one solution`);
    assert.equal(givens.filter(Boolean).length, 81-removals, `${difficulty} clue count`);
    for(let r=0;r<9;r++) assert.equal(new Set(solution.slice(r*9,r*9+9)).size,9,`${difficulty} solution row ${r+1}`);
    for(let c=0;c<9;c++) assert.equal(new Set(Array.from({length:9},(_,r)=>solution[r*9+c])).size,9,`${difficulty} solution column ${c+1}`);
    assert.equal(api.solveSudoku([...solution]).count, 1, `${difficulty} solution is valid`);
  }
});

test('Sudoku board click and number-pad click update the selected cell', () => {
  const { api, listeners, view } = loadMindGrid();
  api.route('sudoku');
  const index=api.sudoku.board.findIndex(value=>value===0), value=api.sudoku.solution[index];
  dispatchClick(listeners,{'[data-cell]':{dataset:{cell:String(index)}}});
  dispatchClick(listeners,{'[data-value]':{dataset:{value:String(value)}}});
  assert.equal(api.sudoku.board[index],value);
  assert.match(view.innerHTML,/selected/);
});

function solveWithMasks(solve, board) { return solve([...board], { limit: 2 }); }

test('Sudoku move validation accepts a solution value and rejects a conflict', () => {
  const { api } = loadMindGrid();
  api.startSudoku('Easy');
  const index = api.sudoku.board.findIndex(value => value === 0);
  const correct = api.sudoku.solution[index];
  api.sudoku.selected = index;
  api.setSudokuValue(correct);
  assert.equal(api.sudoku.board[index], correct);
  const r=Math.floor(index/9),c=index%9;
  const conflict=[1,2,3,4,5,6,7,8,9].find(value=>value!==correct&&api.sudoku.board.some((v,j)=>j!==index&&v===value&&(Math.floor(j/9)===r||j%9===c||Math.floor(Math.floor(j/9)/3)===Math.floor(r/3)&&Math.floor((j%9)/3)===Math.floor(c/3))));
  assert.ok(conflict,'find a value that conflicts with an existing clue');
  api.sudoku.selected=index;
  api.setSudokuValue(conflict);
  assert.equal(api.sudoku.board[index],correct,'conflicting entry leaves the cell unchanged');
});

test('Connect Four detects wins and the AI takes an immediate winning move', () => {
  const { api } = loadMindGrid();
  const board = Array.from({length:6}, () => Array(7).fill(0));
  board[5][0]=2; board[5][1]=2; board[5][2]=2; board[5][3]=2;
  assert.deepEqual(Array.from(api.connectWin(board,2)), [35,36,37,38]);
  board[5][3]=0;
  const decision = api.connectBestMove(board, 5);
  assert.equal(decision.choice, 3);
  assert.ok(decision.stats.nodes > 0);
  const block = Array.from({length:6}, () => Array(7).fill(0));
  block[5][0]=1; block[5][1]=1; block[5][2]=1;
  assert.equal(api.connectBestMove(block,5).choice,3,'AI blocks an immediate human win');
});

test('Connect Four human move triggers an AI reply and returns the turn', async () => {
  const { api, listeners, view } = loadMindGrid();
  api.resetConnect();
  api.route('connect');
  assert.equal((view.innerHTML.match(/data-col=/g)||[]).length,7,'only the seven numbered drop controls accept moves');
  dispatchClick(listeners,{'[data-board-col]':{dataset:{'boardCol':'1'}}});
  assert.equal(api.connect.board.flat().filter(Boolean).length,0,'clicking a board hole does not select a different column');
  dispatchClick(listeners,{'[data-col]':{dataset:{col:'3'}}});
  assert.equal(api.connect.busy, true);
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(api.connect.busy, false);
  assert.equal(api.connect.turn, 1);
  assert.equal(api.connect.board.flat().filter(Boolean).length, 2);
  assert.equal(api.connect.board[5][3],1,'red disc lands at the bottom of the selected fourth column');
});

test('N-Queens bitwise solver returns known solution totals', () => {
  const { api } = loadMindGrid();
  assert.equal(api.queenSearch(4).count, 2);
  assert.equal(api.queenSearch(8).count, 92);
  const fourteen = api.queenSearch(14,true);
  assert.equal(fourteen.count, 365596);
  assert.equal(fourteen.first.length, 14);
});

test('N-Queens interactive placement rejects attacks and accepts a safe solution', () => {
  const { api } = loadMindGrid();
  api.queens.n = 4; api.queens.placed = [];
  api.placeQueen(0,1);
  assert.equal(api.queens.placed.length, 1);
  assert.equal(api.queenSafe(1,1), false);
  assert.equal(api.queenSafe(1,3), true);
  api.placeQueen(1,3);api.placeQueen(2,0);api.placeQueen(3,2);
  assert.deepEqual(Array.from(api.queens.placed), [1,3,0,2]);
});

test('2048 combines each pair once and the heuristic suggests a legal move', () => {
  const { api } = loadMindGrid();
  const row = [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const move = api.apply2048(row,'left');
  assert.deepEqual(Array.from(row[0]), [4,4,0,0]);
  assert.equal(move.earned, 8);
  assert.equal(move.changed, true);
  const vertical = [[2,0,0,0],[2,0,0,0],[4,0,0,0],[0,0,0,0]];
  api.apply2048(vertical,'up');
  assert.deepEqual(Array.from(vertical.map(r=>r[0])), [4,4,0,0]);
  api.reset2048();
  const suggestion = api.best2048();
  const copy = api.game2048.board.map(r=>[...r]);
  assert.equal(api.apply2048(copy,suggestion).changed, true);
});

test('2048 auto-play performs bounded moves and keeps undo snapshots', () => {
  const { api } = loadMindGrid();
  api.reset2048();
  api.auto2048();
  assert.ok(api.game2048.history.length <= 50);
  assert.ok(api.game2048.board.flat().some(Boolean));
  assert.equal(api.game2048.score >= 0, true);
});

test('2048 keyboard move and undo controls work through the UI handlers', () => {
  const { api, listeners } = loadMindGrid();
  api.route('2048');
  api.game2048.board=[[2,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  api.game2048.score=0;api.game2048.history=[];api.game2048.over=false;
  listeners.keydown({target:{},key:'ArrowRight',preventDefault(){}});
  assert.equal(api.game2048.board[0][3],2);
  assert.equal(api.game2048.history.length,1);
  dispatchClick(listeners,{'[data-action]':{dataset:{action:'2048-undo'}}});
  assert.equal(api.game2048.board[0][0],2);
  assert.equal(api.game2048.board[0][3],0);
});

test('benchmark suite returns four labeled measurements', () => {
  const { api, view } = loadMindGrid();
  api.runBenchmarks();
  assert.match(view.innerHTML, /Sudoku solver/);
  assert.match(view.innerHTML, /Connect Four AI/);
  assert.match(view.innerHTML, /8-Queens search/);
  assert.match(view.innerHTML, /2048 best-move scan/);
});
