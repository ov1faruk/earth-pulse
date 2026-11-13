import subprocess, os
FILM='../../The-L-Band_EARTH-PULSE_pitch-240s.mp4'
def ff(*a): subprocess.run(['ffmpeg','-v','error','-y',*a],check=True)
os.makedirs('seg',exist_ok=True)
# 1) old-film segments (video+audio), re-encoded uniformly
OLD=[(0.0,14.6),(14.8,40.4),(45.8,57.3),(90.8,106.0),(131.8,151.2),(151.8,168.8)]
for i,(a,b) in enumerate(OLD):
    ff('-ss',str(a),'-to',str(b),'-i',FILM,'-vf','fps=30,scale=1920:1080,format=yuv420p','-af','afade=t=in:d=0.15,afade=t=out:st=%.2f:d=0.25'%(b-a-0.25),
       '-c:v','libx264','-crf','18','-preset','veryfast','-c:a','aac','-ar','44100','-ac','2',f'seg/old{i}.mp4')
# 2) tail: Ken Burns stills
S=[(5.8,'d_globe','c',1),(7.0,'a_everyone','l',1),(6.0,'a_everyone_s1','l',1),(6.2,'a_everyone_s2','l',1),
   (3.0,'b_farmer','l',1),(3.0,'b_farmer_s1','l',1),(3.2,'b_farmer_s2','l',1),
   (2.8,'c_climber','l',1),(2.6,'c_climber_s1','l',1),(2.4,'c_climber_s2','l',1),(5.4,'c_climber_s3','l',1),(6.4,'d_globe','c',-1)]
parts=[]
for k,(d,f,foc,dirn) in enumerate(S):
    n=int(round(d*30)); zexpr=f"1+0.10*on/{n}" if dirn>0 else f"1.18-0.14*on/{n}"
    fx='0.08' if foc=='l' else '0.5'
    out=f'seg/t{k:02d}.mp4'; parts.append(out)
    ff('-loop','1','-i',f'shots/{f}.png','-vf',f"scale=3840:2160,zoompan=z='{zexpr}':x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*0.45':d={n}:s=1920x1080:fps=30,format=yuv420p",
       '-frames:v',str(n),'-c:v','libx264','-crf','18','-preset','veryfast',out)
# outro from old film video (234.0 -> 240)
ff('-ss','234.2','-to','240','-i',FILM,'-an','-vf','fps=30,scale=1920:1080,format=yuv420p','-c:v','libx264','-crf','18','-preset','veryfast','seg/t99.mp4'); parts.append('seg/t99.mp4')
open('seg/tail.txt','w').write(''.join(f"file '{os.path.basename(p)}'\n" for p in parts))
ff('-f','concat','-safe','0','-i','seg/tail.txt','-i','tail_audio.wav','-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','veryfast','-c:a','aac','-ar','44100','-ac','2','-t','60','seg/tail.mp4')
# 3) join with short crossfades
segs=[f'seg/old{i}.mp4' for i in range(len(OLD))]+['seg/tail.mp4']
dur=[float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',s],capture_output=True,text=True).stdout) for s in segs]
X=0.35; fc=[]; v='[0:v]'; a='[0:a]'; t=dur[0]
for i in range(1,len(segs)):
    t-=X
    fc.append(f"{v}[{i}:v]xfade=transition=fade:duration={X}:offset={t:.3f}[v{i}]"); fc.append(f"{a}[{i}:a]acrossfade=d={X}[a{i}]")
    v=f'[v{i}]'; a=f'[a{i}]'; t+=dur[i]
args=[]; [args.extend(['-i',s]) for s in segs]
ff(*args,'-filter_complex',';'.join(fc),'-map',v,'-map',a,'-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','../../The-L-Band_EARTH-PULSE_pitch-v3.mp4')
print('total', round(t,1))
