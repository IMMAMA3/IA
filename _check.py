import re, json, sys, io
base=r"C:\InfoActions"
html=io.open(base+r"\index.html",encoding="utf-8").read()
css=io.open(base+r"\style.css",encoding="utf-8").read()
js=io.open(base+r"\app.js",encoding="utf-8").read()

required_ids=["theme-toggle","teacher-open","storage-indicator","app","login-view","exam-view","result-view","teacher-view","modal-root","login-form","access-code","login-error","submit-login","timer","answer-input","prev-task","next-task","finish-exam","cancel-modal","confirm-finish","close-forced","return-exam","to-login-btn","teacher-home","master-password","teacher-login-error","teacher-cancel","teacher-login","btn-create-named-codes","students-names","students-class","copy-active-codes","download-csv-btn","clear-local-btn","cancel-clear","confirm-clear","modal-ok","close-copy"]
required_classes=["nav-task","current","answered","progress-bar-fill","progress-info","task-answer-input","task-content-card","hidden","urgent","in-exam","modal-backdrop","modal-dialog","warning-screen","warning-card"]

missing_ids=[i for i in required_ids if f'id="{i}"' not in html and f"id='{i}'" not in html and f'#{i}' not in js and f'id="{i}"' not in js]
# ids can be in html or JS templates
missing_ids=[]
for i in required_ids:
    if (f'id="{i}"' in html or f"id='{i}'" in html or f'id=\\"{i}\\"' in js or f'id="{i}"' in js or f'#{i}' in js or f'getElementById("{i}")' in js):
        pass
    else:
        missing_ids.append(i)

missing_classes=[]
for c in required_classes:
    in_css = ('.'+c) in css
    in_js = ('.'+c) in js or (f'"{c}"' in js) or (f"'{c}'" in js) or (f' {c}' in js) or (f'{c} ' in js)
    in_html = (f'class="{c}' in html or f' {c}' in html or f'{c} ' in html)
    if not (in_css or in_js or in_html):
        missing_classes.append(c)

print('MISSING_IDS', missing_ids)
print('MISSING_CLASSES', missing_classes)
print('HAS_DATA_INDEX', 'data-index' in js)
print('HAS_HIDDEN_CSS', '.hidden' in css)
print('HAS_URGENT_CSS', '.urgent' in css)
print('HAS_IN_EXAM_CSS', '.in-exam' in css or 'in-exam' in js)
# check for common JS template issues
print('PROGRESS_META', 'progress-meta' in js)
print('REVIEW_ROW_MAIN', 'review-row-main' in js)
