/* Прогон полных сезонов без интерфейса: проверка календаря, таблиц, плей-офф и экономики. */
['core','data','players','engine','economy','identity','fans','weather','world','feed','press','season','calendar','transfers','national'].forEach(m=>require('../src/'+m+'.js'));
const S=globalThis.SETKA,{U,DIVISIONS}=S,W=S.World,Sn=S.Season,P=S.Players,Ec=S.Economy;
const seed=Number(process.argv[2]||2024), seasons=Number(process.argv[3]||3);
const g=W.createWorld(seed);
W.assignPlayerClub(g,process.argv[4]||'c50');           // клуб из первенства регионов
console.time('прогон');
for(let s=0;s<seasons;s++){
  Sn.startSeason(g);
  const club=g.clubs[g.playerClubId];
  console.log('\n=== Сезон '+g.seasonLabel+' | '+club.name+' | '+DIVISIONS[club.division].name+' | задача: '+g.board.text);
  let guard=0;
  while(g.phase!=='offseason'&&guard++<60){
    const wk=Sn.startWeek(g);
    if(wk.seasonOver)break;
    let fx,n=0;
    while((fx=Sn.nextPlayerFixture(g))&&n++<10){ Sn.playFixture(g,fx); }
    Sn.completeWeek(g);
  }
  const div=g.divisions[club.division];
  const order=(g.playoffs&&g.playoffs.byDiv[club.division].order)||W.sortTable(div);
  console.log('таблица '+div.name+':');
  order.slice(0,6).forEach((id,i)=>{const r=div.table[id];console.log('  '+(i+1)+'. '+g.clubs[id].name.padEnd(26)+' '+r.pts+' очк, '+r.w+'-'+r.l+', сеты '+r.setsW+':'+r.setsL+(id===club.id?'   <-- вы':''));});
  const st=g.playoffs.byDiv[club.division];
  console.log('чемпион:',st.champion?g.clubs[st.champion].name:'—','| кубок:',g.cup.winner?g.clubs[g.cup.winner].name:'—');
  const fin=club.finance;
  console.log('финансы: баланс',U.money(fin.balance),'доход за сезон',U.money(fin.seasonIncome),'расход',U.money(fin.seasonSpend),'| медийность',club.mediaIndex.toFixed(0));
  const top=club.squad.map(id=>g.players[id]).sort((a,b)=>b.season.points-a.season.points)[0];
  if(top)console.log('лучший бомбардир:',P.fullName(top),top.season.points,'очк за',top.season.matches,'матчей');
  const rep=Sn.endSeason(g);
  console.log('итог: место '+rep.player.position+(rep.player.champion?' ЧЕМПИОН':'')+(rep.player.relegated?' ВЫЛЕТ':'')+(rep.dismissed?' — УВОЛЕН':''));
  console.log('повышены:',rep.divisions.map(d=>d.promoted.map(i=>g.clubs[i].name).join(', ')).filter(Boolean).join(' | '));
  if(rep.dismissed)break;
}
console.timeEnd('прогон');
console.log('матчей сыграно всего:',g.results.length,'| игроков в мире:',Object.keys(g.players).length);
