from pypdf import PdfReader
p=PdfReader('output/pdf/MindGrid_Project_Report_Nitin_Kumar.pdf')
print('pages',len(p.pages))
for i,x in enumerate(p.pages): print('PAGE',i+1,repr((x.extract_text() or '')[:100]))
