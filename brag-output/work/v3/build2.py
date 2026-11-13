import subprocess, os, sys, wave, json
import numpy as np
FILM='../../The-L-Band_EARTH-PULSE_pitch-240s.mp4'; MUSIC='../../pitch-240s-music-only.mp4'; OUT='../../EARTH-PULSE_ad_v4.mp4'
def ff(*a): subprocess.run(['ffmpeg','-v','error','-y',*a],check=True)
os.makedirs('seg2',exist_ok=True)
ENC=['-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-r','30']
# kind: ('still', file, dur, mode)  mode: 'slide' | 'card' | 'ad'    |  ('old', a, b)
V=[('still','h1',7.3,'slide'),('still','h2_1',3.3,'slide'),('still','h2_2',3.4,'slide'),('still','h2_3',4.0,'slide'),('still','h3',5.6,'slide'),
   ('still','team_0',6.4,'slide'),
   ('still','p_everyone',2.6,'ad'),('still','a_everyone',3.2,'card'),('still','a_everyone_s1',3.2,'card'),('still','a_everyone_s2',3.2,'card'),
   ('still','p_farmer',2.6,'ad'),('still','b_farmer',2.2,'card'),('still','b_farmer_s1',2.1,'card'),('still','b_farmer_s2',2.1,'card'),
   ('still','p_climber',2.4,'ad'),('still','c_climber',1.7,'card'),('still','c_climber_s1',1.7,'card'),('still','c_climber_s2',1.6,'card'),
   ('still','w_kathmandu',1.5,'wide'),('still','w_miami',1.5,'wide'),('still','w_lagos',1.5,'wide'),('still','w_tokyo',1.5,'wide'),
   ('still','bridge',5.8,'slide'),
   ('old',99.4,109.8),('old',131.6,151.0),('old',109.8,117.8),('old',167.3,171.6),
   ('still','next',6.5,'slide'),('still','outro',7.5,'slide')]
parts=[]; total=0
for k,v in enumerate(V):
    out=f'seg2/{k:02d}.mp4'; parts.append(out)
    if v[0]=='old':
        a,b=v[1],v[2]; total+=b-a
        ff('-ss',str(a),'-to',str(b),'-i',FILM,'-an','-vf','fps=30,scale=1920:1080',*ENC,out)
    else:
        _,f,d,mode=v; n=int(round(d*30)); total+=n/30
        if mode=='card': z=f"1.20+0.14*on/{n}"; fx,fy='0.0','0.12'
        elif mode=='wide': z=f"1.04+0.05*on/{n}"; fx,fy='0.3','0.4'
        elif mode=='ad': z=f"1.10-0.08*on/{n}"; fx,fy='0.6','0.5'
        else: z=f"1.0+0.045*on/{n}"; fx,fy='0.5','0.5'
        ff('-loop','1','-i',f'shots/{f}.png','-vf',f"scale=3840:2160,zoompan=z='{z}':x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*{fy}':d={n}:s=1920x1080:fps=30",'-frames:v',str(n),*ENC,out)
open('seg2/list.txt','w').write(''.join(f"file '{os.path.basename(p)}'\n" for p in parts))
print('video total',round(total,2))
# ---------- audio ----------
SR=44100; D=total; N=int(D*SR)
def rd(p):
    w=wave.open(p); x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32767; return x.reshape(-1,w.getnchannels())
old=rd('../vo.wav')[:,0]
voice=np.zeros(N,np.float32)
def put(x,t):
    i=int(t*SR); x=x[:N-i]; voice[i:i+len(x)]+=x
for k,t in [('h1',0.5),('h2',7.6),('h3',18.3),('team',23.9),('pick',30.2),('farmer',42.6),('climber',51.6),('one',58.9),('bridge',65.0),('next',113.0),('outro',119.4)]:
    put(np.load(f'vo4/{k}.npy'),t)
for a,b,t in [(96.0,105.75,70.8),(132.0,151.0,81.2),(157.0,168.5,100.8)]:
    x=old[int(a*SR):int(b*SR)].copy(); f=int(.05*SR); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f); put(x,t)
ff('-ss',str(240-D),'-t',str(D),'-i',MUSIC,'-vn','-ac','2','-ar','44100','seg2/music.wav')
m=rd('seg2/music.wav'); m=np.pad(m,((0,max(0,N-len(m))),(0,0)))[:N]
env=np.convolve(np.abs(voice),np.ones(int(.25*SR))/int(.25*SR),'same'); act=np.clip(env/0.02,0,1)
sm=np.convolve(act,np.ones(int(.45*SR))/int(.45*SR),'same'); g=10**(-10*sm/20)
fade=np.ones(N); fi=int(1.5*SR); fade[:fi]=np.linspace(0,1,fi); fo=int(2.5*SR); fade[-fo:]=np.linspace(1,0,fo)
mix=m*g[:,None]*0.8*fade[:,None]+np.stack([voice,voice],1)
mix/=max(1,np.abs(mix).max()/0.97)
w=wave.open('seg2/mix.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes()); w.close()
ff('-f','concat','-safe','0','-i','seg2/list.txt','-i','seg2/mix.wav','-map','0:v','-map','1:a','-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',OUT)
print('done')
