import io, re
path=r"C:\InfoActions\app.js"
text=io.open(path,'r',encoding='utf-8').read()
# sanity checks for template literals / braces
# count backticks
print('backticks', text.count('`'))
# basic check: no obvious broken template from our replacements
for marker in ['exam-topbar','task-nav-buttons','exam-footer-bar','result-card','teacher-wrap','warning-card','modal-actions']:
    print(marker, marker in text)
# check storage indicator in HTML not overwritten badly
html=io.open(r"C:\InfoActions\index.html",encoding='utf-8').read()
print('storage-indicator-html', 'id="storage-indicator"' in html)
print('login-ids', all(x in html for x in ['id="login-form"','id="access-code"','id="login-error"','id="submit-login"']))
print('view-ids', all(x in html for x in ['id="exam-view"','id="result-view"','id="teacher-view"','id="modal-root"','id="app"']))
