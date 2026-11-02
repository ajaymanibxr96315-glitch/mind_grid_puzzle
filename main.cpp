// MindGrid — C++17 console puzzle and AI solver suite
// Build: g++ -std=c++17 -O2 -Wall -Wextra -pedantic main.cpp -o mindgrid

#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <random>
#include <stack>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

// === HEADER: Game.hpp ===
namespace Utils {
    inline std::mt19937& rng() {
        static std::mt19937 engine(static_cast<unsigned>(
            std::chrono::steady_clock::now().time_since_epoch().count()));
        return engine;
    }

    inline int getValidInt(int min, int max) {
        int value;
        for (;;) {
            if (std::cin >> value && value >= min && value <= max) return value;
            std::cout << "Enter a whole number from " << min << " to " << max << ": ";
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        }
    }

    template<class Function>
    long long benchmarkUs(Function&& function) {
        const auto start = std::chrono::steady_clock::now();
        function();
        const auto finish = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::microseconds>(finish - start).count();
    }

    inline std::string color(const std::string& value, const char* code) {
        return std::string("\033[") + code + "m" + value + "\033[0m";
    }
    inline std::string cyan(const std::string& s) { return color(s, "36"); }
    inline std::string green(const std::string& s) { return color(s, "32"); }
    inline std::string yellow(const std::string& s) { return color(s, "33"); }
    inline std::string red(const std::string& s) { return color(s, "31"); }
    inline std::string bold(const std::string& s) { return color(s, "1"); }
    inline void divider(char fill = '=') { std::cout << std::string(68, fill) << '\n'; }
    inline void pageTitle(const std::string& title, const std::string& subtitle = {}) {
        std::cout << '\n'; divider('=');
        std::cout << "  " << bold(cyan("M I N D G R I D")) << "   /   " << bold(title) << '\n';
        if (!subtitle.empty()) std::cout << "  " << subtitle << '\n';
        divider('-');
    }
    inline void menuItem(const char* key, const std::string& label, const std::string& detail = {}) {
        std::cout << "  " << yellow(std::string("[") + key + "]") << "  " << bold(label);
        if (!detail.empty()) std::cout << "  " << detail;
        std::cout << '\n';
    }
    inline void prompt(const std::string& text) { std::cout << '\n' << cyan(text) << ' '; }
}

class Game {
public:
    virtual ~Game() = default;
    virtual void playInteractive() = 0;
    virtual void runAISolverBenchmark() = 0;
    virtual void render() const = 0;
    virtual void reset() = 0;
};

// === HEADER: Profile.hpp ===
struct PlayerProfile {
    int gamesSolved = 0;
    long long highScore2048 = 0;
    long long fastestSolverUs = -1;

    void load() {
        std::ifstream in("profile.txt");
        if (in) in >> gamesSolved >> highScore2048 >> fastestSolverUs;
    }
    void save() const {
        std::ofstream out("profile.txt");
        if (out) out << gamesSolved << ' ' << highScore2048 << ' ' << fastestSolverUs << '\n';
    }
    void recordSolve(long long us) {
        ++gamesSolved;
        if (fastestSolverUs < 0 || us < fastestSolverUs) fastestSolverUs = us;
        save();
    }
    void recordScore(long long score) {
        highScore2048 = std::max(highScore2048, score);
        save();
    }
    void show() const {
        Utils::pageTitle("PLAYER PROFILE", "Your MindGrid progress at a glance");
        std::cout << "  Games solved       " << Utils::bold(std::to_string(gamesSolved))
                  << "\n  2048 high score    " << Utils::bold(std::to_string(highScore2048))
                  << "\n  Fastest solver     ";
        if (fastestSolverUs < 0) std::cout << "none recorded\n";
        else std::cout << fastestSolverUs << " us\n";
    }
};

// === MODULE: Sudoku ===
class SudokuGame : public Game {
    using Grid = std::array<std::array<int, 9>, 9>;
    Grid grid{}, puzzle{};
    std::array<int, 9> rowMask{}, colMask{}, boxMask{};
    std::stack<std::tuple<int, int, int>> history;
    static constexpr int FULL = (1 << 9) - 1;
    static int bitCount(int mask) { int n=0; while(mask) { mask &= mask-1; ++n; } return n; }
    int box(int r, int c) const { return (r / 3) * 3 + c / 3; }
    int candidates(int r, int c) const { return FULL & ~(rowMask[r] | colMask[c] | boxMask[box(r,c)]); }
    void place(int r, int c, int v) {
        grid[r][c] = v;
        if (v) { const int bit = 1 << (v - 1); rowMask[r] |= bit; colMask[c] |= bit; boxMask[box(r,c)] |= bit; }
    }
    void remove(int r, int c) {
        const int v = grid[r][c]; if (!v) return;
        const int bit = 1 << (v - 1); grid[r][c] = 0;
        rowMask[r] &= ~bit; colMask[c] &= ~bit; boxMask[box(r,c)] &= ~bit;
    }
    bool solve(Grid& target, std::array<int,9>& rows, std::array<int,9>& cols,
               std::array<int,9>& boxes, int limit, int& count, bool randomized) {
        int bestR = -1, bestC = -1, bestCount = 10, bestMask = 0;
        for (int r=0;r<9;++r) for (int c=0;c<9;++c) if (!target[r][c]) {
            const int mask = FULL & ~(rows[r] | cols[c] | boxes[(r/3)*3+c/3]);
            const int n = bitCount(mask);
            if (n == 0) return false;
            if (n < bestCount) { bestCount=n; bestR=r; bestC=c; bestMask=mask; if(n==1) goto selected; }
        }
selected:
        if (bestR < 0) { ++count; return count >= limit; }
        std::array<int,9> values{}; int length=0;
        for(int v=1;v<=9;++v) if(bestMask & (1<<(v-1))) values[length++]=v;
        if(randomized) std::shuffle(values.begin(), values.begin()+length, Utils::rng());
        for(int i=0;i<length;++i) {
            int v=values[i], bit=1<<(v-1), b=(bestR/3)*3+bestC/3;
            target[bestR][bestC]=v; rows[bestR]|=bit; cols[bestC]|=bit; boxes[b]|=bit;
            const bool stopped=solve(target,rows,cols,boxes,limit,count,randomized);
            if(stopped) return true;
            target[bestR][bestC]=0; rows[bestR]&=~bit; cols[bestC]&=~bit; boxes[b]&=~bit;
        }
        return false;
    }
    int solutionCount(const Grid& source, int limit=2) {
        Grid copy=source; std::array<int,9> rows{},cols{},boxes{};
        for(int r=0;r<9;++r) for(int c=0;c<9;++c) if(copy[r][c]) {
            const int bit=1<<(copy[r][c]-1), b=(r/3)*3+c/3;
            if((rows[r]|cols[c]|boxes[b])&bit) return 0;
            rows[r]|=bit; cols[c]|=bit; boxes[b]|=bit;
        }
        int count=0; solve(copy,rows,cols,boxes,limit,count,false); return count;
    }
    void generate(int clues) {
        grid={}; rowMask.fill(0); colMask.fill(0); boxMask.fill(0);
        for(int b=0;b<9;b+=3) {
            std::array<int,9> vals{1,2,3,4,5,6,7,8,9};
            std::shuffle(vals.begin(),vals.end(),Utils::rng()); int k=0;
            for(int r=b;r<b+3;++r) for(int c=b;c<b+3;++c) place(r,c,vals[k++]);
        }
        int count=0; solve(grid,rowMask,colMask,boxMask,1,count,true);
        puzzle=grid;
        std::vector<int> cells(81); for(int i=0;i<81;++i) cells[i]=i;
        std::shuffle(cells.begin(),cells.end(),Utils::rng()); int removed=0;
        for(int cell:cells) {
            if(removed>=clues) break;
            int r=cell/9,c=cell%9,old=puzzle[r][c]; puzzle[r][c]=0;
            if(solutionCount(puzzle,2)!=1) puzzle[r][c]=old; else ++removed;
        }
        grid=puzzle; rowMask.fill(0); colMask.fill(0); boxMask.fill(0);
        for(int r=0;r<9;++r) for(int c=0;c<9;++c) if(grid[r][c]) place(r,c,grid[r][c]);
    }
    bool solved() const { for(const auto& row:grid) for(int v:row) if(!v) return false; return true; }
public:
    SudokuGame() { reset(); }
    void reset() override { history={}; generate(35); }
    void render() const override {
        std::cout << "\n     1 2 3   4 5 6   7 8 9\n   +-------+-------+-------+\n";
        for(int r=0;r<9;++r) { std::cout << ' ' << r+1 << " |";
            for(int c=0;c<9;++c) { std::string s=grid[r][c]?std::to_string(grid[r][c]):".";
                if(puzzle[r][c]) s=Utils::cyan(s); else if(grid[r][c]) s=Utils::green(s);
                std::cout << ' ' << s; if(c%3==2) std::cout << " |"; }
            std::cout << '\n'; if(r%3==2) std::cout << "   +-------+-------+-------+\n";
        }
    }
    void runAISolverBenchmark() override {
        Grid work=puzzle; std::array<int,9> rows{},cols{},boxes{};
        for(int r=0;r<9;++r) for(int c=0;c<9;++c) if(work[r][c]) { int bit=1<<(work[r][c]-1),b=box(r,c); rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit; }
        int count=0; const auto us=Utils::benchmarkUs([&]{ solve(work,rows,cols,boxes,1,count,false); });
        if(count) { grid=work; std::cout << "Sudoku solved in " << us << " us.\n"; render(); }
        else std::cout << "No solution found.\n";
    }
    void playInteractive() override {
        for(;;) { render(); Utils::prompt("[1] Move  [2] Undo  [3] Hint  [4] Auto-solve  [5] Easy  [6] Hard  [0] Back\n> ");
            int cmd=Utils::getValidInt(0,6); if(!cmd) return;
            if(cmd==1) { std::cout << "Row (1-9): "; int r=Utils::getValidInt(1,9)-1; std::cout << "Column (1-9): "; int c=Utils::getValidInt(1,9)-1;
                if(puzzle[r][c]) { std::cout << "That cell is fixed.\n"; continue; }
                std::cout << "Value (1-9): "; int v=Utils::getValidInt(1,9); int bit=1<<(v-1), previous=grid[r][c];
                if(previous) remove(r,c);
                if((rowMask[r]|colMask[c]|boxMask[box(r,c)])&bit) { if(previous) place(r,c,previous); std::cout << "That value conflicts with the row, column, or box.\n"; continue; }
                history.push({r,c,previous}); place(r,c,v); if(solved()) std::cout << Utils::green("Puzzle complete!\n");
            } else if(cmd==2) { if(history.empty()) std::cout << "Nothing to undo.\n"; else { auto p=history.top();history.pop();int r=std::get<0>(p),c=std::get<1>(p);remove(r,c);if(std::get<2>(p))place(r,c,std::get<2>(p)); } }
            else if(cmd==3) { Grid w=puzzle; std::array<int,9> a{},b{},d{}; for(int r=0;r<9;++r)for(int c=0;c<9;++c)if(w[r][c]){int bit=1<<(w[r][c]-1),q=box(r,c);a[r]|=bit;b[c]|=bit;d[q]|=bit;} int n=0;solve(w,a,b,d,1,n,false); bool shown=false;for(int r=0;r<9&&!shown;++r)for(int c=0;c<9&&!shown;++c)if(!grid[r][c]){std::cout<<"Hint: row "<<r+1<<", column "<<c+1<<" = "<<w[r][c]<<'\n';shown=true;} }
            else if(cmd==4) runAISolverBenchmark(); else { history={}; generate(cmd==5?35:50); }
        }
    }
};

// === MODULE: ConnectFour ===
class ConnectFourAI : public Game {
    using Board=std::array<std::array<int,7>,6>; Board board{}; int human=1, ai=2;
    long long lastNodes=0,lastPruned=0;
    bool win(int p) const {
        for(int r=0;r<6;++r)for(int c=0;c<7;++c)if(board[r][c]==p)
            for(auto d: {std::pair<int,int>{0,1},{1,0},{1,1},{1,-1}}){int n=1;for(int k=1;k<4;++k){int y=r+d.first*k,x=c+d.second*k;if(y<0||y>=6||x<0||x>=7||board[y][x]!=p)break;++n;}if(n>=4)return true;}
        return false;
    }
    int landing(int c) const { for(int r=5;r>=0;--r)if(!board[r][c])return r;return -1; }
    int evaluate() const {
        int score=0; for(int r=0;r<6;++r) if(board[r][3]==ai) score+=4;
        for(int r=0;r<6;++r)for(int c=0;c<7;++c)for(auto d:{std::pair<int,int>{0,1},{1,0},{1,1},{1,-1}}){int er=r+3*d.first,ec=c+3*d.second;if(er<0||er>=6||ec<0||ec>=7)continue;int a=0,h=0;for(int k=0;k<4;++k){int v=board[r+k*d.first][c+k*d.second];a+=v==ai;h+=v==human;}if(!h)score+=a==3?80:(a==2?12:(a==1?2:0));if(!a)score-=h==3?100:(h==2?14:(h==1?2:0));}
        return score;
    }
    int minimax(int depth,int alpha,int beta,bool maximizing) {
        ++lastNodes; if(win(ai))return 100000+depth;if(win(human))return -100000-depth;if(depth==0)return evaluate();
        bool any=false; if(maximizing){int best=std::numeric_limits<int>::min();for(int c:{3,2,4,1,5,0,6}){int r=landing(c);if(r<0)continue;any=true;board[r][c]=ai;best=std::max(best,minimax(depth-1,alpha,beta,false));board[r][c]=0;alpha=std::max(alpha,best);if(beta<=alpha){++lastPruned;break;}}return any?best:evaluate();}
        int best=std::numeric_limits<int>::max();for(int c:{3,2,4,1,5,0,6}){int r=landing(c);if(r<0)continue;any=true;board[r][c]=human;best=std::min(best,minimax(depth-1,alpha,beta,true));board[r][c]=0;beta=std::min(beta,best);if(beta<=alpha){++lastPruned;break;}}return any?best:evaluate();
    }
    int bestMove() { int best=std::numeric_limits<int>::min(),choice=-1;lastNodes=lastPruned=0;for(int c:{3,2,4,1,5,0,6}){int r=landing(c);if(r<0)continue;board[r][c]=ai;int score=minimax(6,std::numeric_limits<int>::min()+1,std::numeric_limits<int>::max(),false);board[r][c]=0;if(score>best){best=score;choice=c;}}return choice; }
    bool full() const { for(int c=0;c<7;++c)if(!board[0][c])return false;return true; }
public:
    void reset() override { board={};lastNodes=lastPruned=0; }
    void render() const override { Utils::pageTitle("CONNECT FOUR", "You are X  /  MindGrid AI is O"); std::cout<<"     1   2   3   4   5   6   7\n   +---+---+---+---+---+---+---+\n";for(const auto& row:board){std::cout<<"   |";for(int v:row)std::cout<<' '<<(v==human?Utils::yellow("X"):v==ai?Utils::red("O"):" ")<<" |";std::cout<<"\n   +---+---+---+---+---+---+---+\n";} }
    void runAISolverBenchmark() override { reset();board[5][3]=human;int choice=-1;long long us=Utils::benchmarkUs([&]{choice=bestMove();});std::cout<<"Connect Four depth-7 move: column "<<choice+1<<", "<<lastNodes<<" nodes, "<<lastPruned<<" alpha-beta cutoffs, "<<us<<" us.\n"; }
    void playInteractive() override { reset();for(;;){render();if(win(human)){std::cout<<"You win!\n";return;}if(win(ai)){std::cout<<"AI wins.\n";return;}if(full()){std::cout<<"Draw.\n";return;}std::cout<<"Column 1-7 (0 exits): ";int c=Utils::getValidInt(0,7);if(!c)return;--c;int r=landing(c);if(r<0){std::cout<<"Column is full.\n";continue;}board[r][c]=human;if(win(human))continue;long long us=Utils::benchmarkUs([&]{int m=bestMove();if(m>=0){int q=landing(m);if(q>=0)board[q][m]=ai;}});std::cout<<"AI: "<<lastNodes<<" nodes, "<<lastPruned<<" alpha-beta cutoffs, "<<us<<" us.\n";}}
};

// === MODULE: NQueensTour ===
class NQueensTour : public Game {
    int n=8; std::vector<int> queen; std::vector<std::vector<int>> solutions;
    std::uint32_t fullMask() const { return (1u<<n)-1u; }
    void search(int row,std::uint32_t cols,std::uint32_t left,std::uint32_t right,std::vector<int>& path,long long& count,bool collect) {
        if(row==n){++count;if(collect&&solutions.empty())solutions.push_back(path);return;}
        std::uint32_t available=fullMask()&~(cols|left|right);
        while(available){std::uint32_t bit=available&(~available+1u);available-=bit;int column=0;while((bit>>column)!=1u)++column;path[row]=column;search(row+1,cols|bit,((left|bit)<<1)&fullMask(),(right|bit)>>1,path,count,collect);}
    }
    bool safe(int r,int c) const { for(int i=0;i<r;++i)if(queen[i]==c||std::abs(queen[i]-c)==r-i)return false;return true; }
public:
    NQueensTour(){reset();}
    void reset() override { n=8;queen.assign(n,-1);solutions.clear(); }
    void render() const override { Utils::pageTitle("N-QUEENS TOUR", "Q = queen  /  x = attacked square  /  . = available");std::cout<<"     ";for(int c=0;c<n;++c)std::cout<<std::setw(2)<<c+1<<' ';std::cout<<'\n';for(int r=0;r<n;++r){std::cout<<std::setw(3)<<r+1<<"  ";for(int c=0;c<n;++c){if(queen[r]==c)std::cout<<Utils::yellow("Q")<<"  ";else{bool attacked=false;for(int rr=0;rr<n;++rr)if(queen[rr]>=0&&(queen[rr]==c||std::abs(queen[rr]-c)==std::abs(rr-r))){attacked=true;break;}std::cout<<(attacked?Utils::red("x"):".")<<"  ";}}std::cout<<'\n';}}
    void runAISolverBenchmark() override { long long count=0;std::vector<int> path(n,-1);solutions.clear();auto start=std::chrono::steady_clock::now();search(0,0,0,0,path,count,true);auto end=std::chrono::steady_clock::now();auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(end-start).count();std::cout<<n<<"-Queens: "<<count<<" solutions, first placement";if(!solutions.empty())for(int c:solutions.front())std::cout<<' '<<c+1;std::cout<<", "<<ms<<" ms.\n";}
    void playInteractive() override { std::cout<<"Choose board size (4-14): ";n=Utils::getValidInt(4,14);queen.assign(n,-1);for(int row=0;row<n;){render();std::cout<<"Place queen in row "<<row+1<<" (column 1-"<<n<<", 0=undo, -1=exit): ";int c;while(!(std::cin>>c)||c < -1||c>n){std::cout<<"Enter -1, 0, or 1-"<<n<<": ";std::cin.clear();std::cin.ignore(std::numeric_limits<std::streamsize>::max(),'\n');}if(c==-1)return;if(c==0){if(row){queen[--row]=-1;}else std::cout<<"No queen to undo.\n";continue;}--c;if(!safe(row,c)){std::cout<<"That square is attacked; choose another column.\n";continue;}queen[row++]=c;}render();std::cout<<Utils::green("All queens placed safely!\n");}
};

// === MODULE: Game2048 ===
class Game2048 : public Game {
    using Grid=std::array<std::array<int,4>,4>; Grid grid{}; long long score=0;
    struct Snapshot{Grid grid;long long score;};std::stack<Snapshot> history;
    void spawn(){std::vector<std::pair<int,int>> empty;for(int r=0;r<4;++r)for(int c=0;c<4;++c)if(!grid[r][c])empty.push_back({r,c});if(empty.empty())return;std::uniform_int_distribution<int>d(0,static_cast<int>(empty.size())-1);auto p=empty[d(Utils::rng())];grid[p.first][p.second]=(std::uniform_int_distribution<int>(1,10)(Utils::rng())==1)?4:2;}
    bool move(char dir){Grid old=grid;for(int line=0;line<4;++line){std::vector<int> vals;for(int k=0;k<4;++k){int r,c;if(dir=='L'){r=line;c=k;}else if(dir=='R'){r=line;c=3-k;}else if(dir=='U'){r=k;c=line;}else{r=3-k;c=line;}if(grid[r][c])vals.push_back(grid[r][c]);}for(size_t i=0;i+1<vals.size();++i)if(vals[i]==vals[i+1]){vals[i]*=2;score+=vals[i];vals.erase(vals.begin()+static_cast<long>(i+1));}while(vals.size()<4)vals.push_back(0);for(int k=0;k<4;++k){int r,c;if(dir=='L'){r=line;c=k;}else if(dir=='R'){r=line;c=3-k;}else if(dir=='U'){r=k;c=line;}else{r=3-k;c=line;}grid[r][c]=vals[k];}}return old!=grid;}
    double heuristic(const Grid& g)const{int empty=0,maxTile=0;double mono=0;for(int r=0;r<4;++r)for(int c=0;c<4;++c){empty+=g[r][c]==0;maxTile=std::max(maxTile,g[r][c]);if(c<3&&g[r][c]&&g[r][c+1])mono+=std::abs(std::log2(g[r][c])-std::log2(g[r][c+1]));if(r<3&&g[r][c]&&g[r+1][c])mono+=std::abs(std::log2(g[r][c])-std::log2(g[r+1][c]));}bool corner=g[0][0]==maxTile||g[0][3]==maxTile||g[3][0]==maxTile||g[3][3]==maxTile;return empty*260.0-mono*14.0+(corner?180.0:0.0)+std::log2(std::max(1,maxTile))*5.0;}
    char bestDirection(){double best=-1e100;char choice='L';for(char d:{'L','R','U','D'}){Grid before=grid;long long oldScore=score;if(move(d)){double value=heuristic(grid)+(score-oldScore)*0.1;if(value>best){best=value;choice=d;}}grid=before;score=oldScore;}return choice;}
    bool gameOver()const{for(int r=0;r<4;++r)for(int c=0;c<4;++c){if(!grid[r][c])return false;if(c<3&&grid[r][c]==grid[r][c+1])return false;if(r<3&&grid[r][c]==grid[r+1][c])return false;}return true;}
public:
    Game2048(){reset();}
    long long currentScore() const { return score; }
    void reset()override{grid={};score=0;history={};spawn();spawn();}
    void render()const override{Utils::pageTitle("2048", "W/A/S/D slide  /  combine matching tiles  /  reach 2048");std::cout<<"  SCORE  "<<Utils::bold(std::to_string(score))<<"\n  +------------+------------+------------+------------+\n";for(const auto& row:grid){std::cout<<"  |";for(int v:row){const std::string raw=v?std::to_string(v):"";const std::string tile=v?Utils::bold(raw):Utils::color("·","90");const std::size_t padding=raw.size()<10?10-raw.size():0;std::cout<<' '<<std::string(padding,' ')<<tile<<" |";}std::cout<<"\n  +------------+------------+------------+------------+\n";}}
    void runAISolverBenchmark()override{reset();char choice='?';long long us=Utils::benchmarkUs([&]{choice=bestDirection();move(choice);});std::cout<<"2048 greedy best move: "<<choice<<", "<<us<<" us.\n";render();}
    void playInteractive()override{for(;;){render();if(gameOver()){std::cout<<Utils::yellow("No moves left.")<<" Final score: "<<score<<'\n';return;}Utils::prompt("[W/A/S/D] Slide  [H] Hint  [P] Auto-play  [U] Undo  [N] New  [0] Back\n> ");char cmd;std::cin>>cmd;cmd=static_cast<char>(std::toupper(static_cast<unsigned char>(cmd)));if(cmd=='0')return;if(cmd=='N'){reset();continue;}if(cmd=='U'){if(!history.empty()){grid=history.top().grid;score=history.top().score;history.pop();}else std::cout<<"Nothing to undo.\n";continue;}if(cmd=='H'){std::cout<<"Suggested move: "<<Utils::bold(std::string(1,bestDirection()))<<'\n';continue;}if(cmd=='P'){for(int i=0;i<50&&!gameOver();++i){char d=bestDirection();history.push({grid,score});if(move(d))spawn();else history.pop();}continue;}char d=cmd=='A'?'L':cmd=='D'?'R':cmd=='W'?'U':cmd=='S'?'D':'?';if(d=='?'){std::cout<<"Unknown command.\n";continue;}history.push({grid,score});if(move(d))spawn();else history.pop();}}
};

// === MODULE: Arcade Hub / main ===
int main() {
    PlayerProfile profile; profile.load();
    SudokuGame sudoku; ConnectFourAI connectFour; NQueensTour queens; Game2048 game2048;
    for(;;) {
        Utils::pageTitle("PUZZLE ARCADE", "Four games. Four algorithms. One move at a time.");
        std::cout << "  +------------------------------+------------------------------+\n"
                  << "  |  " << Utils::bold("CHOOSE A GAME") << "              |  " << Utils::bold("ARCADE TOOLS") << "              |\n"
                  << "  |  " << Utils::yellow("[1]") << " Sudoku                 |  " << Utils::yellow("[5]") << " Player profile          |\n"
                  << "  |  " << Utils::yellow("[2]") << " Connect Four            |  " << Utils::yellow("[6]") << " Benchmark suite         |\n"
                  << "  |  " << Utils::yellow("[3]") << " N-Queens Tour           |                              |\n"
                  << "  |  " << Utils::yellow("[4]") << " 2048                    |                              |\n"
                  << "  +------------------------------+------------------------------+\n"
                  << "  " << Utils::red("[0]") << " Exit\n";
        Utils::prompt("Select an option (0-6) >");
        int choice=Utils::getValidInt(0,6); if(!choice){profile.save();std::cout<<"Profile saved. Goodbye!\n";return 0;}
        if(choice==5){profile.show();continue;}
        if(choice==6){Utils::pageTitle("ALL-ALGORITHMS BENCHMARK", "Running each solver against a fresh or current puzzle");for(Game* g:{static_cast<Game*>(&sudoku),static_cast<Game*>(&connectFour),static_cast<Game*>(&queens),static_cast<Game*>(&game2048)}){long long us=Utils::benchmarkUs([&]{g->runAISolverBenchmark();});profile.recordSolve(us);}continue;}
        Game* game=choice==1?static_cast<Game*>(&sudoku):choice==2?static_cast<Game*>(&connectFour):choice==3?static_cast<Game*>(&queens):static_cast<Game*>(&game2048);
        const std::string gameName=choice==1?"SUDOKU":choice==2?"CONNECT FOUR":choice==3?"N-QUEENS TOUR":"2048";
        Utils::pageTitle(gameName, "Choose how you want to play");
        Utils::menuItem("1", "Play", "interactive game");
        Utils::menuItem("2", "AI benchmark", "run the solver");
        Utils::menuItem("3", "Reset", "start fresh");
        Utils::menuItem("0", "Back", "return to arcade");
        Utils::prompt("Your choice (0-3) >");int action=Utils::getValidInt(0,3);if(action==1)game->playInteractive();else if(action==2){long long us=Utils::benchmarkUs([&]{game->runAISolverBenchmark();});profile.recordSolve(us);}else if(action==3)game->reset();
        if(choice==4)profile.recordScore(game2048.currentScore());
    }
}
