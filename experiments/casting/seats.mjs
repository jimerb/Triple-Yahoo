const KEY='ty-rounds-seat';
export const seats={
 get(){try{return JSON.parse(sessionStorage.getItem(KEY)||localStorage.getItem(KEY)||'null');}catch{return null;}},
 set(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));localStorage.setItem(KEY,JSON.stringify(value));localStorage.setItem('ty-nickname',value.name||'');}catch{}},
 clear(){try{sessionStorage.removeItem(KEY);localStorage.removeItem(KEY);}catch{}}
};
export function rememberedName(){try{return localStorage.getItem('ty-nickname')||'';}catch{return '';}}
export function rememberName(name){try{localStorage.setItem('ty-nickname',name);}catch{}}
