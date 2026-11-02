/* MindGrid browser arcade: plain JavaScript, no framework or build step. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const view = $('#view');
  const toast = $('#toast');
  const profileKey = 'mindgrid-profile-v1';
  const profile = Object.assign({ solved: 0, high2048: 0, fastestMs: null }, safeRead(profileKey));
  let activeScreen = 'home';
  let toastTimer = null;

  function safeRead(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }
  function saveProfile() {
    localStorage.setItem(profileKey, JSON.stringify(profile));
    $('#sidebar-solved').textContent = `${profile.solved} puzzles solved`;
  }
  function notify(message, success = false) {
    toast.textContent = message;
    toast.classList.toggle('success', success);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }
  function recordSolved() {
    profile.solved += 1;
    saveProfile();
  }
  function timeSolver(fn) {
    const start = performance.now();
    const result = fn();
    const elapsed = performance.now() - start;
    profile.fastestMs = profile.fastestMs == null ? elapsed : Math.min(profile.fastestMs, elapsed);
    saveProfile();
    return { result, elapsed };
  }
  function setActive(screen) {
    activeScreen = screen;
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === screen));
    $('#crumb-current').textContent = screen === 'home' ? 'OVERVIEW' : screen === '2048' ? '2048' : screen.toUpperCase();
  }
  function route(screen) {
    setActive(screen);
    if (screen === 'home') renderHome();
    else if (screen === 'sudoku') renderSudoku();
    else if (screen === 'connect') renderConnect();
    else if (screen === 'queens') renderQueens();
    else if (screen === '2048') render2048();
    else renderBenchmarks();
  }
  function button(label, action, kind = 'ghost', extra = '') {
    return `<button class="button ${kind} ${extra}" data-action="${action}">${label}</button>`;
  }

  function renderHome() {
    view.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">YOUR DAILY DOSE OF LOGIC</p>
          <h1>A sharper mind starts with one move.</h1>
          <p>Four classic puzzles, four clever solvers. Pick a challenge and see where your next idea takes you.</p>
          <button class="button" data-action="play-featured">Play Sudoku <span aria-hidden="true">↗</span></button>
        </div>
        <div class="hero-art" aria-hidden="true"><span>3</span><span>8</span><span>1</span><span>6</span><span>5</span><span>9</span></div>
      </section>
      <div class="section-head"><div><p class="eyebrow">THE ARCADE</p><h2>Choose your challenge</h2></div><p>Four games · Play at your own pace</p></div>
      <section class="game-grid">
        ${gameCard('sudoku', '▦', '01', 'Sudoku', 'Logic & deduction', 'Fill the grid. Every number has its place.', 'Easy · Medium · Hard')}
        ${gameCard('connect', '◉', '02', 'Connect Four', 'Strategy & search', 'Line up four before the AI does.', 'Human vs AI')}
        ${gameCard('queens', '♛', '03', 'N-Queens Tour', 'Patterns & planning', 'Place queens. Keep every row safe.', '4 to 14 queens')}
        ${gameCard('2048', '2048', '04', '2048', 'Focus & foresight', 'Merge the tiles. Make every move count.', 'W · A · S · D')}
      </section>
      <div class="section-head"><div><p class="eyebrow">YOUR PROGRESS</p><h2>Little wins add up</h2></div><button class="button ghost small" data-screen="benchmarks">View benchmarks ↗</button></div>
      <section class="stats-row">
        <div class="stat-card"><span class="stat-symbol">✓</span><div><strong>${profile.solved}</strong><span>Puzzles solved</span></div></div>
        <div class="stat-card"><span class="stat-symbol">▧</span><div><strong>${profile.high2048}</strong><span>2048 high score</span></div></div>
        <div class="stat-card"><span class="stat-symbol">⌁</span><div><strong>${profile.fastestMs == null ? '—' : `${profile.fastestMs.toFixed(1)} ms`}</strong><span>Fastest solver run</span></div></div>
      </section>`;
  }
  function gameCard(routeName, icon, number, title, type, description, meta) {
    const iconClass = routeName === 'connect' ? 'connect' : routeName === 'queens' ? 'queens' : routeName === '2048' ? 'g2048' : 'sudoku';
    return `<article class="game-card" role="button" tabindex="0" data-screen="${routeName}">
      <div class="game-card-top"><span class="game-icon ${iconClass}">${icon}</span><span class="game-number">MG / ${number}</span></div>
      <h3>${title}</h3><p>${description}</p>
      <div class="game-card-bottom"><span><strong>${type}</strong><br>${meta}</span><span class="arrow-link">↗</span></div>
    </article>`;
  }

  // Sudoku engine: bitmask validation, MRV search, unique-puzzle generation.
  const sudoku = { board: [], givens: [], solution: [], selected: -1, history: [], difficulty: 'Easy', status: '' };
  const fullSudokuMask = (1 << 9) - 1;
  const boxIndex = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
  function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function sudokuMasks(board) {
    const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    for (let i = 0; i < 81; i++) if (board[i]) {
      const r = Math.floor(i / 9), c = i % 9, bit = 1 << (board[i] - 1), b = boxIndex(r, c);
      if ((rows[r] | cols[c] | boxes[b]) & bit) return null;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
    }
    return { rows, cols, boxes };
  }
  function solveSudoku(board, { random = false, limit = 1 } = {}) {
    const masks = sudokuMasks(board);
    if (!masks) return { count: 0, solution: null };
    let count = 0, answer = null;
    function search() {
      let best = -1, bestMask = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) if (!board[i]) {
        const r = Math.floor(i / 9), c = i % 9;
        const mask = fullSudokuMask & ~(masks.rows[r] | masks.cols[c] | masks.boxes[boxIndex(r, c)]);
        let n = 0; for (let m = mask; m; m &= m - 1) n++;
        if (!n) return;
        if (n < bestCount) { best = i; bestMask = mask; bestCount = n; if (n === 1) break; }
      }
      if (best < 0) { count++; if (!answer) answer = [...board]; return count >= limit; }
      const r = Math.floor(best / 9), c = best % 9, b = boxIndex(r, c);
      let values = []; for (let v = 1; v <= 9; v++) if (bestMask & (1 << (v - 1))) values.push(v);
      if (random) values = shuffled(values);
      for (const v of values) {
        const bit = 1 << (v - 1); board[best] = v; masks.rows[r] |= bit; masks.cols[c] |= bit; masks.boxes[b] |= bit;
        const stop = search();
        board[best] = 0; masks.rows[r] &= ~bit; masks.cols[c] &= ~bit; masks.boxes[b] &= ~bit;
        if (stop) return true;
      }
      return false;
    }
    search();
    return { count, solution: answer };
  }
  function makeSudokuPuzzle(removals) {
    const board = Array(81).fill(0);
    for (let start = 0; start < 9; start += 3) {
      const digits = shuffled([1,2,3,4,5,6,7,8,9]); let k = 0;
      for (let r = start; r < start + 3; r++) for (let c = start; c < start + 3; c++) board[r * 9 + c] = digits[k++];
    }
    const full = solveSudoku(board, { random: true }).solution;
    const puzzle = [...full];
    for (const index of shuffled(Array.from({ length: 81 }, (_, i) => i))) {
      if (puzzle.filter(Boolean).length <= 81 - removals) break;
      const old = puzzle[index]; puzzle[index] = 0;
      if (solveSudoku([...puzzle], { limit: 2 }).count !== 1) puzzle[index] = old;
    }
    return { puzzle, solution: full };
  }
  function startSudoku(difficulty = sudoku.difficulty) {
    sudoku.difficulty = difficulty;
    const removals = { Easy: 35, Medium: 43, Hard: 50 }[difficulty];
    const generated = makeSudokuPuzzle(removals);
    sudoku.board = [...generated.puzzle]; sudoku.givens = [...generated.puzzle]; sudoku.solution = generated.solution;
    sudoku.history = []; sudoku.selected = -1; sudoku.status = '';
  }
  function renderSudoku() {
    if (!sudoku.board.length) startSudoku();
    const selected = sudoku.selected, selectedValue = selected >= 0 ? sudoku.board[selected] : 0;
    const boardHtml = sudoku.board.map((value, i) => {
      const r = Math.floor(i / 9), c = i % 9;
      const peer = selected >= 0 && (r === Math.floor(selected / 9) || c === selected % 9 || boxIndex(r, c) === boxIndex(Math.floor(selected / 9), selected % 9));
      const conflict = value && sudoku.board.some((other, j) => j !== i && other === value && (Math.floor(j / 9) === r || j % 9 === c || boxIndex(Math.floor(j / 9), j % 9) === boxIndex(r, c)));
      const classes = ['sudoku-cell', sudoku.givens[i] ? 'given' : '', peer ? 'peer' : '', selected >= 0 && selectedValue && value === selectedValue ? 'same-number' : '', selected === i ? 'selected' : '', conflict ? 'conflict' : ''].filter(Boolean).join(' ');
      return `<button class="${classes}" data-cell="${i}" aria-label="Row ${r + 1}, column ${c + 1}${value ? `, ${value}` : ', empty'}">${value || ''}</button>`;
    }).join('');
    view.innerHTML = `<div class="game-heading"><div><p class="eyebrow">01 / LOGIC & DEDUCTION</p><h1>Sudoku</h1><p class="subhead">Every row, column, and 3 × 3 box needs the numbers 1 through 9. Find the one that fits.</p></div><div class="game-heading-actions">${button('New puzzle ↻','sudoku-new','dark')}</div></div>
      <div class="game-layout"><div class="panel board-panel"><div class="panel-title"><strong>Daily grid</strong><div class="segmented">${['Easy','Medium','Hard'].map(level => `<button class="${sudoku.difficulty === level ? 'active' : ''}" data-difficulty="${level}">${level}</button>`).join('')}</div></div>
        <div class="sudoku-board" role="grid" aria-label="Sudoku puzzle">${boardHtml}</div><div class="sudoku-status">${sudoku.status || 'Select a cell, then choose a number.'}</div></div>
        <aside class="side-panel"><div class="panel info-panel"><h3>Number pad</h3><p>Choose a value for the selected square.</p><div class="number-pad">${Array.from({length:9},(_,i)=>`<button data-value="${i+1}">${i+1}</button>`).join('')}</div><div class="control-row">${button('Erase','sudoku-erase','ghost','small')}${button('Undo','sudoku-undo','ghost','small')}</div></div>
        <div class="panel info-panel"><h3>Need a nudge?</h3><p>Reveal one correct value or let the solver finish the grid.</p><div class="control-row">${button('Hint ✦','sudoku-hint','ghost','small')}${button('Solve grid','sudoku-solve','dark','small')}</div></div>
        <div class="panel info-panel"><h3>Solver</h3><p>Bitmask validation + minimum remaining values.</p><div class="benchmark-value">${sudoku.givens.filter(Boolean).length}<small> clues</small></div></div></aside></div>`;
  }
  function setSudokuValue(value) {
    const i = sudoku.selected;
    if (i < 0) return notify('Select an empty square first.');
    if (sudoku.givens[i]) return notify('That square is a fixed clue.');
    const next = [...sudoku.board], previous = next[i]; next[i] = value;
    if (value) {
      const r = Math.floor(i / 9), c = i % 9;
      if (next.some((v, j) => j !== i && v === value && (Math.floor(j / 9) === r || j % 9 === c || boxIndex(Math.floor(j / 9), j % 9) === boxIndex(r, c)))) {
        sudoku.status = `${value} already appears in this row, column, or box.`; renderSudoku(); return;
      }
    }
    sudoku.history.push([...sudoku.board]); sudoku.board[i] = value; sudoku.status = '';
    if (sudoku.board.every((v, j) => v === sudoku.solution[j])) { sudoku.status = 'Beautifully solved!'; recordSolved(); notify('Sudoku solved. Nice work!', true); }
    else if (value && previous !== value) sudoku.status = 'Good move. Keep going.';
    renderSudoku();
  }

  // Connect Four minimax with alpha-beta pruning.
  const connect = { board: [], turn: 1, over: false, busy: false, status: 'Your turn — choose a column.', nodes: 0, cuts: 0, winning: [] };
  function resetConnect() { connect.board = Array.from({length:6}, () => Array(7).fill(0)); connect.turn = 1; connect.over = false; connect.busy = false; connect.status = 'Your turn — choose a column.'; connect.nodes = 0; connect.cuts = 0; connect.winning = []; }
  function connectDrop(board, col, piece) { for (let r = 5; r >= 0; r--) if (!board[r][col]) { board[r][col] = piece; return r; } return -1; }
  function connectWin(board, piece) {
    for (let r=0;r<6;r++) for(let c=0;c<7;c++) if(board[r][c]===piece) for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      const cells=[]; for(let k=0;k<4;k++){const y=r+dr*k,x=c+dc*k;if(y<0||y>=6||x<0||x>=7||board[y][x]!==piece)break;cells.push(y*7+x);} if(cells.length===4)return cells;
    }
    return [];
  }
  function connectEval(board) {
    let score=0;
    for(let r=0;r<6;r++) if(board[r][3]===2)score+=5;
    for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const er=r+3*dr,ec=c+3*dc;if(er<0||er>=6||ec<0||ec>=7)continue;
      let ai=0,human=0;for(let k=0;k<4;k++){const v=board[r+k*dr][c+k*dc];ai+=v===2;human+=v===1;}
      if(!human)score += ai===3?90:ai===2?15:ai===1?2:0;
      if(!ai)score -= human===3?110:human===2?18:human===1?2:0;
    }
    return score;
  }
  function connectMinimax(board, depth, alpha, beta, maximizing, stats) {
    stats.nodes++;
    if(connectWin(board,2).length)return 100000+depth;
    if(connectWin(board,1).length)return -100000-depth;
    if(!depth || board[0].every(Boolean))return connectEval(board);
    let best=maximizing?-Infinity:Infinity, didMove=false;
    for(const col of [3,2,4,1,5,0,6]){
      const row=connectDrop(board,col,maximizing?2:1);if(row<0)continue;didMove=true;
      const value=connectMinimax(board,depth-1,alpha,beta,!maximizing,stats);board[row][col]=0;
      if(maximizing){best=Math.max(best,value);alpha=Math.max(alpha,best);}else{best=Math.min(best,value);beta=Math.min(beta,best);}
      if(beta<=alpha){stats.cuts++;break;}
    }
    return didMove?best:connectEval(board);
  }
  function connectBestMove(board, depth=5) {
    const stats={nodes:0,cuts:0};let best=-Infinity,choice=-1;
    for(const col of [3,2,4,1,5,0,6]){const row=connectDrop(board,col,2);if(row<0)continue;const score=connectMinimax(board,depth-1,-Infinity,Infinity,false,stats);board[row][col]=0;if(score>best){best=score;choice=col;}}
    return {choice,stats};
  }
  function renderConnect() {
    if(!connect.board.length)resetConnect();
    const cells=connect.board.flatMap((row,r)=>row.map((piece,c)=>`<div class="connect-hole ${piece===1?'red':piece===2?'yellow':''} ${connect.winning.includes(r*7+c)?'winning':''}" data-board-col="${c}" role="img" aria-label="Row ${r+1}, column ${c+1}${piece?' occupied':''}"></div>`)).join('');
    view.innerHTML=`<div class="game-heading"><div><p class="eyebrow">02 / STRATEGY & SEARCH</p><h1>Connect Four</h1><p class="subhead">Drop a disc into any open column. Make a line of four before the AI.</p></div><div class="game-heading-actions">${button('New match ↻','connect-new','dark')}</div></div>
      <div class="game-layout"><div class="panel board-panel"><div class="panel-title"><strong>Human vs MindGrid AI</strong><span>AI depth 5</span></div><div class="connect-board-wrap"><div class="connect-columns">${Array.from({length:7},(_,c)=>`<button data-col="${c}" aria-label="Drop a disc in column ${c+1}" title="Drop in column ${c+1}" ${connect.over||connect.busy||connect.board[0][c]?'disabled':''}>↓ ${c+1}</button>`).join('')}</div><div class="connect-board">${cells}</div></div><div class="sudoku-status">${connect.status}<span class="column-feedback"> Select a numbered arrow above the board to drop in that column.</span></div></div>
      <aside class="side-panel"><div class="panel info-panel"><h3>Turn</h3><div class="turn-indicator"><i class="turn-dot ${connect.turn===2?'yellow':''}"></i>${connect.over?'Match complete':connect.busy?'AI is thinking…':connect.turn===1?'Your move (red)':'AI move (yellow)'}</div></div>
      <div class="panel info-panel"><h3>AI activity</h3><p>Minimax search with alpha-beta pruning looks ahead before each move.</p><div class="benchmark-value">${connect.nodes}<small> nodes searched</small></div><p>${connect.cuts} alpha-beta cutoffs · last move</p></div>
      <div class="panel info-panel"><h3>How to win</h3><p>Connect four discs horizontally, vertically, or diagonally. The AI prioritizes the center and blocks threats.</p></div></aside></div>`;
  }
  function playConnect(col) {
    if(connect.over||connect.busy||connect.turn!==1||connectDrop(connect.board,col,1)<0)return;
    let line=connectWin(connect.board,1);
    if(line.length){connect.winning=line;connect.over=true;connect.status='You connected four — a win!';recordSolved();notify('You beat the AI!',true);renderConnect();return;}
    if(connect.board[0].every(Boolean)){connect.over=true;connect.status='The board is full. It’s a draw.';renderConnect();return;}
    connect.turn=2;connect.busy=true;connect.status=`Your red disc landed in column ${col+1}. MindGrid is searching…`;renderConnect();
    setTimeout(()=>{
      const {choice,stats}=connectBestMove(connect.board,5);connect.nodes=stats.nodes;connect.cuts=stats.cuts;
      if(choice>=0)connectDrop(connect.board,choice,2);
      line=connectWin(connect.board,2);connect.busy=false;
      if(line.length){connect.winning=line;connect.over=true;connect.status='MindGrid found four. Better luck next round.';}
      else if(connect.board[0].every(Boolean)){connect.over=true;connect.status='The board is full. It’s a draw.';}
      else{connect.turn=1;connect.status=`MindGrid played column ${choice+1}. Your turn — choose a column.`;}
      renderConnect();
    },100);
  }

  // N-Queens bitwise search and interactive one-queen-per-row board.
  const queens={n:8,placed:[],count:null,first:null,elapsed:null};
  function queenSafe(row,col){for(let r=0;r<queens.placed.length;r++){const c=queens.placed[r];if(c===col||Math.abs(c-col)===row-r)return false;}return true;}
  function queenSearch(n,collect=false){let count=0,first=null;const full=(1<<n)-1,path=Array(n).fill(-1);
    function visit(row,cols,left,right){if(row===n){count++;if(collect&&!first)first=[...path];return;}
      let available=full&~(cols|left|right);while(available){const bit=available&-available;available-=bit;let col=0;while((bit>>col)!==1)col++;path[row]=col;visit(row+1,cols|bit,((left|bit)<<1)&full,(right|bit)>>1);}}
    const start=performance.now();visit(0,0,0,0);return {count,first,elapsed:performance.now()-start};}
  function renderQueens(){
    const n=queens.n;
    const board=Array.from({length:n*n},(_,i)=>{const r=Math.floor(i/n),c=i%n,has=queens.placed[r]===c;let attacked=false;for(let rr=0;rr<queens.placed.length;rr++){const cc=queens.placed[rr];if(cc>=0&&(cc===c||Math.abs(cc-c)===Math.abs(rr-r))){attacked=true;break;}}
      return `<button class="queen-cell ${((r+c)%2===0)?'light':'dark'} ${attacked?'attacked':''} ${has?'queen':''}" data-qrow="${r}" data-qcol="${c}" aria-label="Row ${r+1}, column ${c+1}${has?', queen':attacked?', attacked':''}">${has?'♛':''}</button>`;}).join('');
    const result=queens.count==null?'Place one queen in each row without conflicts.':`${queens.count.toLocaleString()} valid solutions · ${queens.elapsed.toFixed(2)} ms`;
    view.innerHTML=`<div class="game-heading"><div><p class="eyebrow">03 / PATTERNS & PLANNING</p><h1>N-Queens Tour</h1><p class="subhead">Place N queens on the board so none can attack another. The solver uses bitwise backtracking.</p></div><div class="game-heading-actions"><div class="queen-controls"><label for="queen-size" class="muted">Board size</label><select id="queen-size">${Array.from({length:11},(_,i)=>i+4).map(size=>`<option value="${size}" ${size===n?'selected':''}>${size} × ${size}</option>`).join('')}</select>${button('New board ↻','queen-new','ghost','small')}</div></div></div>
      <div class="game-layout"><div class="panel board-panel"><div class="panel-title"><strong>${n} queens</strong><span>row ${Math.min(queens.placed.length+1,n)} of ${n}</span></div><div class="queens-board" style="grid-template-columns:repeat(${n},1fr)">${board}</div><div class="queen-legend"><span><i class="legend-dot"></i>Board square</span><span><i class="legend-dot attack"></i>Queen attack line</span></div></div>
      <aside class="side-panel"><div class="panel info-panel"><h3>Your placement</h3><p>${queens.placed.length} of ${n} queens placed.</p><div class="control-row">${button('Undo last','queen-undo','ghost','small')}${button('Clear board','queen-clear','ghost','small')}</div></div>
      <div class="panel info-panel"><h3>Solver benchmark</h3><p>Count every possible arrangement for this board size.</p><div class="benchmark-value">${queens.count==null?'—':queens.count.toLocaleString()}<small>${queens.count==null?' solutions':' solutions'}</small></div><p>${queens.count==null?'Ready to search':result}</p><div class="control-row">${button('Find a solution','queen-solve','dark','small')}${button('Count all','queen-count','ghost','small')}</div></div></aside></div>`;
  }
  function placeQueen(row,col){if(row!==queens.placed.length){notify(row<queens.placed.length?'Undo a queen to change an earlier row.':`Place a queen in row ${queens.placed.length+1} first.`);return;}
    if(!queenSafe(row,col)){notify('That square is attacked by a queen already on the board.');return;}
    queens.placed.push(col);if(queens.placed.length===queens.n){recordSolved();notify('All queens placed safely!',true);}renderQueens();}

  // 2048: matrix movement, one-merge-per-turn, undo, heuristic best move.
  const game2048={board:[],score:0,history:[],over:false};
  const empty2048=()=>Array.from({length:4},()=>Array(4).fill(0));
  function spawn2048(board){const empty=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(!board[r][c])empty.push([r,c]);if(!empty.length)return;const [r,c]=empty[Math.floor(Math.random()*empty.length)];board[r][c]=Math.random()<.9?2:4;}
  function reset2048(){game2048.board=empty2048();game2048.score=0;game2048.history=[];game2048.over=false;spawn2048(game2048.board);spawn2048(game2048.board);}
  function clone2048(){return {board:game2048.board.map(row=>[...row]),score:game2048.score};}
  function apply2048(board,direction){let changed=false,earned=0;
    for(let line=0;line<4;line++){let values=[];for(let k=0;k<4;k++){let r,c;if(direction==='left'){r=line;c=k;}else if(direction==='right'){r=line;c=3-k;}else if(direction==='up'){r=k;c=line;}else{r=3-k;c=line;}if(board[r][c])values.push(board[r][c]);}
      for(let i=0;i<values.length-1;i++)if(values[i]===values[i+1]){values[i]*=2;earned+=values[i];values.splice(i+1,1);}
      while(values.length<4)values.push(0);
      for(let k=0;k<4;k++){let r,c;if(direction==='left'){r=line;c=k;}else if(direction==='right'){r=line;c=3-k;}else if(direction==='up'){r=k;c=line;}else{r=3-k;c=line;}if(board[r][c]!==values[k])changed=true;board[r][c]=values[k];}}
    return {changed,earned};}
  function heuristic2048(board){let empty=0,max=0,monotonicity=0;for(let r=0;r<4;r++)for(let c=0;c<4;c++){const v=board[r][c];if(!v)empty++;max=Math.max(max,v);if(v&&c<3&&board[r][c+1])monotonicity+=Math.abs(Math.log2(v)-Math.log2(board[r][c+1]));if(v&&r<3&&board[r+1][c])monotonicity+=Math.abs(Math.log2(v)-Math.log2(board[r+1][c]));}
    const corner=board[0][0]===max||board[0][3]===max||board[3][0]===max||board[3][3]===max;return empty*260-monotonicity*14+(corner?180:0)+Math.log2(Math.max(max,1))*5;}
  function best2048(){let best=-Infinity,choice='left';for(const direction of ['left','right','up','down']){const board=game2048.board.map(row=>[...row]),move=apply2048(board,direction);if(move.changed){const value=heuristic2048(board)+move.earned*.1;if(value>best){best=value;choice=direction;}}}return choice;}
  function isOver2048(board=game2048.board){for(let r=0;r<4;r++)for(let c=0;c<4;c++){if(!board[r][c])return false;if(c<3&&board[r][c]===board[r][c+1])return false;if(r<3&&board[r][c]===board[r+1][c])return false;}return true;}
  function slide2048(direction){if(game2048.over)return;const before=clone2048(),move=apply2048(game2048.board,direction);if(!move.changed)return;game2048.history.push(before);game2048.score+=move.earned;spawn2048(game2048.board);game2048.over=isOver2048();profile.high2048=Math.max(profile.high2048,game2048.score);saveProfile();render2048();if(game2048.over)notify('No moves left — start a new board to play again.');}
  function render2048(){if(!game2048.board.length)reset2048();
    const tiles=game2048.board.flat().map(v=>`<div class="tile" data-value="${v||''}">${v||''}</div>`).join('');
    view.innerHTML=`<div class="game-heading"><div><p class="eyebrow">04 / FOCUS & FORESIGHT</p><h1>2048</h1><p class="subhead">Slide the tiles, merge matching numbers, and make room for your next move.</p></div><div class="game-heading-actions">${button('New game ↻','2048-new','dark')}</div></div>
      <div class="game2048-layout"><div class="panel board-panel"><div class="panel-title"><strong>Classic mode</strong><span class="score-chip">SCORE <strong>${game2048.score}</strong></span></div><div class="game2048-board" aria-label="2048 game board">${tiles}</div><div class="sudoku-status">${game2048.over?'No moves remain. Start a new game.':'Use W A S D or the arrow keys to move tiles.'}</div></div>
      <aside class="side-panel"><div class="panel info-panel"><h3>Make a move</h3><p>Every slide shifts the full board. Equal neighbors merge once per turn.</p><div class="key-hint"><span>↑</span><span>W</span><span>←</span><span>A</span><span>↓</span><span>S</span><span>→</span></div></div>
      <div class="panel info-panel"><h3>MindGrid helper</h3><p>Keep open spaces and build toward a high corner tile.</p><div class="control-row"><button class="button ghost small" data-action="2048-hint" ${game2048.over?'disabled':''}>Suggest ${best2048().toUpperCase()} ✦</button><button class="button dark small" data-action="2048-auto" ${game2048.over?'disabled':''}>Auto-play 50</button></div></div>
      <div class="panel info-panel"><h3>Board controls</h3><p>Undo one move or reset the board whenever you like.</p><div class="control-row">${button('Undo move','2048-undo','ghost','small')}${button('New board','2048-new','ghost','small')}</div></div></aside></div>`;
  }
  function auto2048(){for(let i=0;i<50&&!game2048.over;i++){const direction=best2048(),before=clone2048(),move=apply2048(game2048.board,direction);if(!move.changed)break;game2048.history.push(before);game2048.score+=move.earned;spawn2048(game2048.board);game2048.over=isOver2048();}profile.high2048=Math.max(profile.high2048,game2048.score);saveProfile();render2048();}

  // Benchmark dashboard stores the latest measured browser runs.
  let benchmarkResults=[];
  function renderBenchmarks(){
    const cards=benchmarkResults.length?`<div class="benchmark-grid">${benchmarkResults.map(item=>`<article class="panel benchmark-card"><p class="eyebrow">${item.tag}</p><h3>${item.name}</h3><div class="benchmark-value">${item.time.toFixed(2)}<small> ms</small></div><div class="benchmark-meta">${item.detail}</div></article>`).join('')}</div>`:`<div class="panel empty-benchmark"><div><span class="game-icon sudoku">⌁</span><h3>Ready when you are</h3><p>Run the suite to see how quickly each algorithm solves its challenge. Results are measured in your browser.</p></div></div>`;
    view.innerHTML=`<div class="game-heading"><div><p class="eyebrow">SOLVER LAB</p><h1>Benchmarks</h1><p class="subhead">A quick look under the hood. Each solver tackles a fresh puzzle and reports its elapsed time.</p></div><div class="game-heading-actions">${button('Run all benchmarks ▶','benchmark-run','dark')}</div></div>${cards}<div class="section-head"><div><p class="eyebrow">ALGORITHMS</p><h2>Four ways to think</h2></div></div><div class="game-grid">${gameCard('sudoku','▦','01','Sudoku','Backtracking','MRV chooses the tightest square first.','Bitmasks')}${gameCard('connect','◉','02','Connect Four','Minimax','Alpha-beta pruning trims the search.','Game tree')}${gameCard('queens','♛','03','N-Queens','Bitwise search','Column and diagonal masks track attacks.','State space')}${gameCard('2048','2048','04','2048','Greedy heuristic','Open cells, order, and corner value.','Matrix')}</div>`;
  }
  function runBenchmarks(){
    const results=[];
    const puzzle=makeSudokuPuzzle(42).puzzle;
    const sudokuRun=timeSolver(()=>solveSudoku([...puzzle],{limit:1}));
    results.push({tag:'BACKTRACKING + MRV',name:'Sudoku solver',time:sudokuRun.elapsed,detail:'One complete 9 × 9 solution'});
    const board=Array.from({length:6},()=>Array(7).fill(0));board[5][3]=1;board[5][2]=2;board[4][3]=1;
    const connectRun=timeSolver(()=>connectBestMove(board,5));
    results.push({tag:'MINIMAX + ALPHA-BETA',name:'Connect Four AI',time:connectRun.elapsed,detail:`${connectRun.result.stats.nodes.toLocaleString()} nodes · ${connectRun.result.stats.cuts} cutoffs`});
    const queenRun=timeSolver(()=>queenSearch(queens.n,true));
    results.push({tag:'BITWISE BACKTRACKING',name:`${queens.n}-Queens search`,time:queenRun.elapsed,detail:`${queenRun.result.count.toLocaleString()} valid arrangements`});
    const board2048=[[2,0,2,4],[4,4,0,2],[0,8,8,0],[2,4,0,2]];
    const moveRun=timeSolver(()=>{let best=-Infinity,choice='left';for(const d of ['left','right','up','down']){const copy=board2048.map(r=>[...r]),m=apply2048(copy,d);if(m.changed&&heuristic2048(copy)+m.earned*.1>best){best=heuristic2048(copy)+m.earned*.1;choice=d;}}return choice;});
    results.push({tag:'GREEDY HEURISTIC',name:'2048 best-move scan',time:moveRun.elapsed,detail:`Suggested move: ${moveRun.result.toUpperCase()}`});
    benchmarkResults=results;renderBenchmarks();notify('All four benchmarks are complete.',true);
  }

  // Delegated UI events keep controls alive after each lightweight re-render.
  document.addEventListener('click', event => {
    const nav=event.target.closest('[data-screen]');
    if(nav){event.preventDefault();route(nav.dataset.screen);return;}
    const cell=event.target.closest('[data-cell]');if(cell){sudoku.selected=Number(cell.dataset.cell);renderSudoku();return;}
    const value=event.target.closest('[data-value]');if(value&&activeScreen==='sudoku'){setSudokuValue(Number(value.dataset.value));return;}
    const diff=event.target.closest('[data-difficulty]');if(diff){startSudoku(diff.dataset.difficulty);renderSudoku();return;}
    const col=event.target.closest('[data-col]');if(col&&activeScreen==='connect'){playConnect(Number(col.dataset.col));return;}
    const q=event.target.closest('[data-qrow]');if(q&&activeScreen==='queens'){placeQueen(Number(q.dataset.qrow),Number(q.dataset.qcol));return;}
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
    switch(action){
      case 'play-featured': route('sudoku'); break;
      case 'sudoku-new': startSudoku();renderSudoku();break;
      case 'sudoku-erase':setSudokuValue(0);break;
      case 'sudoku-undo':if(sudoku.history.length){sudoku.board=sudoku.history.pop();sudoku.status='Move undone.';renderSudoku();}else notify('There is no move to undo.');break;
      case 'sudoku-hint':{const i=sudoku.board.findIndex((v,index)=>!v&&!sudoku.givens[index]);if(i<0){notify('The board is full already.');break;}sudoku.selected=i;sudoku.history.push([...sudoku.board]);sudoku.board[i]=sudoku.solution[i];sudoku.status=`Hint placed at row ${Math.floor(i/9)+1}, column ${i%9+1}.`;if(sudoku.board.every((v,j)=>v===sudoku.solution[j])){recordSolved();sudoku.status='Beautifully solved!';notify('Sudoku solved with the final hint.',true);}renderSudoku();break;}
      case 'sudoku-solve':{const {elapsed}=timeSolver(()=>{sudoku.board=[...sudoku.solution];});sudoku.status=`Solved in ${elapsed.toFixed(2)} ms.`;recordSolved();renderSudoku();notify(`Solved in ${elapsed.toFixed(2)} ms.`,true);break;}
      case 'connect-new':resetConnect();renderConnect();break;
      case 'queen-new':queens.placed=[];queens.count=null;queens.first=null;renderQueens();break;
      case 'queen-undo':if(queens.placed.length){queens.placed.pop();renderQueens();}else notify('No queen to undo.');break;
      case 'queen-clear':queens.placed=[];renderQueens();break;
      case 'queen-solve':{const {result,elapsed}=timeSolver(()=>queenSearch(queens.n,true));queens.first=result.first;queens.placed=[...result.first];queens.count=result.count;queens.elapsed=elapsed;recordSolved();renderQueens();break;}
      case 'queen-count':{const {result,elapsed}=timeSolver(()=>queenSearch(queens.n,false));queens.count=result.count;queens.elapsed=elapsed;renderQueens();break;}
      case '2048-new':reset2048();render2048();break;
      case '2048-hint':notify(`Try moving ${best2048().toUpperCase()}.`,true);break;
      case '2048-auto':auto2048();break;
      case '2048-undo':if(game2048.history.length){const before=game2048.history.pop();game2048.board=before.board;game2048.score=before.score;game2048.over=false;render2048();}else notify('There is no move to undo.');break;
      case 'benchmark-run':runBenchmarks();break;
    }
  });
  document.addEventListener('keydown',event=>{
    const card=event.target.closest?.('.game-card[data-screen]');
    if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();route(card.dataset.screen);return;}
    if(activeScreen==='sudoku'&&/^[1-9]$/.test(event.key)){setSudokuValue(Number(event.key));return;}
    if(activeScreen==='sudoku'&&(event.key==='Backspace'||event.key==='Delete')){setSudokuValue(0);return;}
    if(activeScreen==='sudoku'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const i=Math.max(0,sudoku.selected),r=Math.floor(i/9),c=i%9;const next={ArrowUp:Math.max(0,r-1)*9+c,ArrowDown:Math.min(8,r+1)*9+c,ArrowLeft:r*9+Math.max(0,c-1),ArrowRight:r*9+Math.min(8,c+1)}[event.key];sudoku.selected=next;renderSudoku();}
    if(activeScreen==='2048'){
      const directions={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
      if(directions[event.key]){event.preventDefault();slide2048(directions[event.key]);}
    }
  });
  view.addEventListener('change',event=>{if(event.target.id==='queen-size'){queens.n=Number(event.target.value);queens.placed=[];queens.count=null;renderQueens();}});
  $('#help-button').addEventListener('click',()=>{
    $('#modal-root').innerHTML=`<div class="overlay" data-modal-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="modal-head"><div><p class="eyebrow">QUICK START</p><h2 id="help-title">How to play</h2></div><button class="modal-close" data-modal-close aria-label="Close">×</button></div><p>Pick a game from the left rail. Each board has its own controls and a built-in solver.</p><ul class="how-list"><li><strong>Sudoku:</strong> select a square, then use the number pad or keyboard.</li><li><strong>Connect Four:</strong> choose a column to drop your red disc.</li><li><strong>N-Queens:</strong> click a safe square in the next empty row.</li><li><strong>2048:</strong> use W/A/S/D or the arrow keys to slide.</li></ul></section></div>`;
  });
  $('#modal-root').addEventListener('click',event=>{if(event.target.hasAttribute('data-modal-close'))$('#modal-root').innerHTML='';});
  saveProfile();
  renderHome();
})();
