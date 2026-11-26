import io
# Check for .in-exam rule - JS adds class to body; CSS may not need it but spec listed as hook; it's fine if JS toggles it.
# Also check the .nav-task.current appears twice because of .nav-task.current.answered - that's ok (selector substring).
# Check for potential issue: .task-answer-input has 4 matches - likely base, focus, and media? Let's inspect.
path=r"C:\InfoActions\style.css"
css=io.open(path,encoding='utf-8').read()
import re
for m in re.finditer(r'\.task-answer-input[^{]*\{', css):
    start=m.start()
    # print line number
    line=css[:start].count('\n')+1
    print(line, m.group(0)[:60])
print('---')
for m in re.finditer(r'\.in-exam[^{]*\{', css):
    line=css[:m.start()].count('\n')+1
    print(line, m.group(0)[:60])
