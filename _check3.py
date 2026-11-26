import io,sys
path=r"C:\InfoActions\style.css"
css=io.open(path,'r',encoding='utf-8').read()
# check for duplicate/conflicting key rules and required selectors
checks=['.nav-task.current','.nav-task.answered','.nav-task.current.answered','.progress-bar-fill','.progress-info','.task-answer-input','.task-content-card','.hidden','.urgent','.in-exam','.modal-backdrop','.modal-dialog','.warning-screen','.warning-card','.exam-topbar','.exam-layout','.task-nav','.nav-grid','.task-nav-buttons','.exam-footer-bar','.result-card','.teacher-wrap','.analytics-grid','.teacher-main-grid','.table-results','.active-codes-list','.storage-indicator']
for c in checks:
    print(c, css.count(c))
# look for accidental old light background artifacts
print('rgba(var(--bg-surface)', 'rgba(var(--bg-surface)' in css)
