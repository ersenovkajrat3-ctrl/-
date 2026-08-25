require('../src/core.js');require('../src/data.js');require('../src/players.js');require('../src/engine.js');
const S=globalThis.SETKA,P=S.Players,E=S.Engine;
const rng=new S.RNG(Number(process.argv[2]||11));
function team(level,name){const sq=P.makeSquad(rng,level,0,name,2);
 const byRole=r=>sq.filter(p=>p.role===r);
 const lineup=[byRole('S')[0],byRole('OP')[0],byRole('OH')[0],byRole('MB')[0],byRole('OH')[1],byRole('MB')[1]];
 lineup.forEach(p=>p.st=P.emptyStats());
 const lib=byRole('L')[0]; lib.st=P.emptyStats();
 return new E.Side({name},lineup,lib,{},{});}
function duel(l1,l2,n){let w=0,lines={},sets=0,reasons={},rall=0,att=0,kills=0,rec=0,perf=0;
 for(let i=0;i<n;i++){const a=team(l1,'A'),b=team(l2,'B');const log=E.playMatch(rng,a,b,{});
  if(log.winner===a)w++;sets+=log.sets.length;lines[log.score.join('-')]=(lines[log.score.join('-')]||0)+1;
  log.sets.forEach(s=>s.rallies.forEach(r=>{reasons[r.reason]=(reasons[r.reason]||0)+1;rall++;}));
  att+=a.stats.attacks+b.stats.attacks;kills+=a.stats.kills+b.stats.kills;rec+=a.stats.receptions+b.stats.receptions;perf+=a.stats.recPerfect+b.stats.recPerfect;}
 const pct=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,(v/rall*100).toFixed(1)+'%']));
 return {win:(w/n*100).toFixed(1)+'%',avgSets:(sets/n).toFixed(2),lines,
   outcomes:pct(reasons),kill:(kills/att*100).toFixed(1)+'%',perfectRec:(perf/rec*100).toFixed(1)+'%'};}
const pairs=process.argv[3]?JSON.parse(process.argv[3]):[[74,66],[74,70],[70,70],[70,66],[74,74],[66,60],[74,58]];
for(const [a,b] of pairs) console.log(a+' vs '+b, JSON.stringify(duel(a,b,200)));
