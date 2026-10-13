export type ReactionCategory='strength'|'movement'|'water'|'reading'|'morning'|'other';
export const reactionCategories:{id:ReactionCategory;label:string;cue:string}[]=[
 {id:'strength',label:'Strength / gym',cue:'💪'},
 {id:'movement',label:'Run / walk / movement',cue:'👟'},
 {id:'water',label:'Water / hydration',cue:'💧'},
 {id:'reading',label:'Reading / learning',cue:'📖'},
 {id:'morning',label:'Morning routine',cue:'☀️'},
 {id:'other',label:'Other',cue:'✨'},
];
const lines:Record<ReactionCategory,string[]>={
 strength:['You showed up for yourself today. Strong work!','That effort counts. Take a moment to feel proud.'],
 movement:['Every step counts. You did that!','You kept moving in your own way. Nice work!'],
 water:['A little care for yourself, one sip at a time.','You made space to look after yourself today.'],
 reading:['You made room to learn today.','A little curiosity can take you far.'],
 morning:['You gave your day a thoughtful start.','You started with intention today.'],
 other:['You followed through on something that matters to you.','One small promise kept. I’m cheering for you!'],
};
export function reactionFor(category:ReactionCategory,taskId:string,date:string){const messages=lines[category]??lines.other;const hash=[...taskId+date].reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,0);return {text:messages[hash%messages.length],cue:reactionCategories.find(x=>x.id===category)?.cue??'✨',category};}
