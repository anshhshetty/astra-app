// A realistic 8-week history used only for visual testing.
import { writeFileSync } from 'node:fs';
const key = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const G = { from: '2000-01-01', kcal: 2600, protein: 135, carbs: 320, fat: 72, water: 3000, workouts: 4 };
const logs=[],days=[],workouts=[],body=[]; let id=1;
const push=['Bench press','Incline dumbbell press','Lateral raise'], pull=['Lat pulldown','Barbell row','Barbell curl'], leg=['Squat','Romanian deadlift','Leg press'];
const M={'Bench press':'Chest','Incline dumbbell press':'Chest','Lateral raise':'Shoulders','Lat pulldown':'Back','Barbell row':'Back','Barbell curl':'Biceps','Squat':'Legs','Romanian deadlift':'Legs','Leg press':'Legs'};
const base={'Bench press':60,'Incline dumbbell press':22,'Lateral raise':8,'Lat pulldown':50,'Barbell row':50,'Barbell curl':25,'Squat':80,'Romanian deadlift':70,'Leg press':120};
const start=new Date(2026,8,8,12);
for(let i=0;i<55;i++){const d=new Date(start);d.setDate(d.getDate()+i);const k=key(d);if(k>'2026-11-01')break;
  const r=(n)=>((i*7+n*13)%10)/10;
  if(i%17!==16){for(const [meal,name,per,g] of [['Breakfast','Oats with water',{kcal:71,p:2.5,c:12,f:1.5},300],['Lunch','Dal tadka',{kcal:110,p:6,c:14,f:3.5},250],['Lunch','Rice, white cooked',{kcal:130,p:2.7,c:28,f:.3},250],['Snacks','Whey protein',{kcal:400,p:78,c:7,f:6},30+Math.round(r(1))*30],['Dinner','Chicken curry',{kcal:130,p:13,c:4,f:7},300+r(2)*200],['Dinner','Roti / chapati',{kcal:280,p:9,c:50,f:4},120+r(3)*60]]){
    const f=g/100;logs.push({id:id++,date:k,meal,name,grams:Math.round(g),per100:per,kcal:Math.round(per.kcal*f),p:+(per.p*f).toFixed(1),c:+(per.c*f).toFixed(1),f:+(per.f*f).toFixed(1),createdAt:1,sourceLabel:'Built-in list'});}}
  days.push({date:k,water:1500+Math.round(r(4)*2000),rest:i%7===6});
  if(i%7!==6&&i%7!==3&&i%7!==5){const l=[push,pull,leg][i%3];const w=base;workouts.push({id:id++,date:k,name:['Push','Pull','Legs'][i%3],startedAt:d.getTime(),endedAt:d.getTime()+3e6,exercises:l.map(n=>({name:n,muscle:M[n],kind:'weight',sets:[0,1,2].map(()=>({w:Math.round(w[n]+i*.4),r:8,done:true}))}))});}
  if(i%3===0)body.push({date:k,weight:+(74-i*.03+(i%2)*.2).toFixed(1),waist:+(84-i*.02).toFixed(1)});
}
writeFileSync(process.argv[2],JSON.stringify({app:'roti-reps',version:1,tables:{foods:[],logs,days,workouts,routines:[],exercises:[],body,photos:[],thumbs:[]},settings:{onboarded:true,goalHistory:[G],meals:['Breakfast','Lunch','Snacks','Dinner'],theme:'system',restSeconds:90,profile:{sex:'male',age:28,heightCm:175,weightKg:74,activity:1.55,goal:'gain'}}}));
