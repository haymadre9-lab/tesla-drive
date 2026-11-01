/* Propuesta de ventanas: mismo nº de imágenes y mismo tamaño que v-actual; cambia solo el dibujo (coste de ejecución ≈ igual). */
const FAM=[['#b0553c','#9d4a34'],['#8d6d50','#7a5e44'],['#d8c8a6','#cbb994'],['#c8a468','#b8945a'],['#e3dccf','#d3cbbb'],['#a7adb4','#979da5'],['#b6cfe4','#a5c1da']];
function hex2rgb(x){return [parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)];}
function osc(x,f){const c=hex2rgb(x).map(v=>Math.round(v*f));return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');}
function imagenVieja(color,noche,semilla,S){
  const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),u=S/64;
  let s=semilla>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  g.fillStyle=noche?osc(color,0.42):color;g.fillRect(0,0,S,S);
  for(let r=0;r<4;r++)for(let k=0;k<4;k++){const x=(k*16+4)*u,y=(r*16+3)*u;
    g.fillStyle='rgba(0,0,0,.26)';g.fillRect(x-u,y-u,10*u,12*u);
    const enc=noche&&rnd()<0.34;g.fillStyle=noche?(enc?'#ffd27a':'#1a212b'):'#5f7388';g.fillRect(x,y,8*u,10*u);
    if(!noche){g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x,y,8*u,3*u);}}
  return c;
}
/* estilos por familia: 0,1 casa (ladrillo/marrón) · 2,3 clásico (crema/ocre) · 4,5 bloque (blanco/gris) · 6 muro cortina (azul) */
const ESTILO=[0,0,1,1,2,2,3];
const LUCES_C=['#ffd27a','#ffc46b','#ffe3a8','#ffb86a'], LUCES_F=['#e8f1ff','#d6e6ff'], TV='#8fb4ff';
function imagenNueva(fam,tono,noche,k,S){
  const color=FAM[fam][tono], est=ESTILO[fam], seed=(fam*2+tono+1)*7+k*131+(noche?3:0);
  const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),u=S/64;
  let s=seed>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const base=noche?osc(color,0.42):color;
  g.fillStyle=base;g.fillRect(0,0,S,S);
  /* perfil nocturno: k=0 «tranquilo» (~18 % encendidas, cálidas) · k=1 «animado» (~55 %, algo de luz fría y azul de TV) */
  const pEnc = k? 0.55 : 0.18;
  // plantas de oficina: en muro cortina y bloques animados se enciende la planta entera
  const plantaOficina=[0,0,0,0]; if(noche&&(est===3||(est===2&&k))) for(let r=0;r<4;r++) plantaOficina[r]=rnd()<(k?0.45:0.2)?1:0;
  const luz=()=>{const q=rnd(); return q<0.05?TV : (est>=2&&q<0.30?LUCES_F[(rnd()*2)|0]:LUCES_C[(rnd()*4)|0]);};
  for(let r=0;r<4;r++){
    if(est===2){ // bloque: franja de forjado
      g.fillStyle=noche?'rgba(0,0,0,.28)':'rgba(0,0,0,.10)';g.fillRect(0,(r*16+14.5)*u,S,2*u);
    }
    for(let kk=0;kk<4;kk++){
      const X=kk*16, Y=r*16;
      let x,y,w,h;
      if(est===0){x=(X+4.5)*u;y=(Y+3)*u;w=7*u;h=9*u;}             // casa: ventana casi cuadrada pequeña
      else if(est===1){x=(X+4.5)*u;y=(Y+2)*u;w=7*u;h=11*u;}        // clásico: alta y estrecha
      else if(est===2){x=(X+2)*u;y=(Y+4)*u;w=12*u;h=8*u;}          // bloque: ancha
      else {x=(X+0.5)*u;y=(Y+1)*u;w=15*u;h=13*u;}                  // muro cortina: casi toda la celda
      const enc = noche && (plantaOficina[r] ? rnd()<0.9 : rnd()<pEnc);
      // marco / jambas
      if(est<=1){g.fillStyle=noche?'rgba(0,0,0,.35)':'rgba(255,255,255,.35)';g.fillRect(x-1.2*u,y-1.2*u,w+2.4*u,h+2.4*u);}
      else if(est===2){g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x-u,y-u,w+2*u,h+2*u);}
      // cristal
      if(noche){
        if(enc){const col=luz();g.fillStyle=col;g.fillRect(x,y,w,h);
          if(est<=1&&rnd()<0.45){g.fillStyle='rgba(20,15,10,.55)';g.fillRect(x,y,w,h*(0.25+rnd()*0.3));}      // persiana a medio bajar
          g.fillStyle='rgba(255,230,170,.16)';g.fillRect(x-1.5*u,y-1.5*u,w+3*u,h+3*u);}                          // halo
        else {g.fillStyle=est===3?'#222c3b':'#1a212b';g.fillRect(x,y,w,h);}
      }else{
        g.fillStyle=est===3?'#7d97b5':'#5f7388';g.fillRect(x,y,w,h);
        const q=rnd(); if(q<0.15&&est<=1){g.fillStyle='rgba(235,230,215,.75)';g.fillRect(x,y,w,h*0.55);}        // persiana bajada
        else {g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x,y,w,h*0.3);}
        if(est===3){g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.moveTo(x,y+h);g.lineTo(x+w*0.6,y);g.lineTo(x+w,y);g.lineTo(x+w*0.4,y+h);g.fill();}
      }
      // detalles baratos
      if(est===0){g.fillStyle=noche?'rgba(0,0,0,.4)':'rgba(240,235,225,.9)';g.fillRect(x-1.5*u,y+h+0.5*u,w+3*u,1.4*u);                    // alféizar
        if(!noche&&rnd()<0.35){g.fillStyle='#4a5a3f';g.fillRect(x-2.5*u,y,2*u,h);g.fillRect(x+w+0.5*u,y,2*u,h);}}                          // contraventanas
      if(est===1){g.fillStyle=noche?'rgba(0,0,0,.5)':'rgba(40,40,45,.8)';g.fillRect(x-2*u,y+h+0.8*u,w+4*u,1.1*u);}                           // balconcillo (barandilla)
      if(est===2&&!noche&&rnd()<0.12){g.fillStyle='#9aa0a6';g.fillRect(x+w-4*u,y+h+1.2*u,4*u,2.4*u);}                                      // aire acondicionado
      if(est===3){g.fillStyle=noche?'rgba(0,0,0,.35)':'rgba(30,45,60,.35)';g.fillRect(x+w-0.4*u,y,0.8*u,h);}                                  // montante
    }
  }
  return c;
}
