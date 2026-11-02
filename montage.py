from PIL import Image,ImageDraw
import glob,os
fs=glob.glob('tmp/report_render/page-*.png'); ims=[]
for f in fs:
 im=Image.open(f).convert('RGB'); im.thumbnail((220,310)); ims.append((f,im.copy()))
out=Image.new('RGB',(880,340*((len(ims)+3)//4)),'#ddd'); d=ImageDraw.Draw(out)
for i,(f,im) in enumerate(ims):
 x=i%4*220;y=i//4*340;out.paste(im,(x,y));d.text((x+5,y+312),os.path.basename(f),fill='black')
out.save('tmp/report_render/contact.png')
