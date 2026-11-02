p='create_report.py'
s=open(p,encoding='utf-8-sig').read()
s=s.replace("def bullets(items):\n    for x in items: story.append(P('&bull;&nbsp; '+x,'Bodyx'))", "def bullets(items):\n    return [P('&bull;&nbsp; '+x,'Bodyx') for x in items]")
s=s.replace("canvas.drawRightString(w-25*mm,10.5*mm,str(doc.page-1))", "label = ['i','ii','iii'][doc.page-2] if 2 <= doc.page <= 4 else str(doc.page-4)\n        canvas.drawRightString(w-25*mm,10.5*mm,label)")
open(p,'w',encoding='utf-8').write(s)
