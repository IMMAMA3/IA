import io, re
path=r"C:\InfoActions\style.css"
css=io.open(path,encoding='utf-8').read()
old=css

# Add .in-exam hook (no visual change, preserves selector presence)
if '.in-exam' not in css:
    css = css.replace('/* ---------- Shared states ---------- */',
                      '/* in-exam state is toggled by JS on <body> */\n.in-exam {}\n\n/* ---------- Shared states ---------- */',1)
    print('added in-exam')
else:
    print('in-exam exists')

# Fix master password / modal code-input: password should not be uppercase/mono-spaced like access code
old_block='''.code-input {
  height: 56px;
  padding: 0 var(--space-4) 0 44px;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}'''
new_block='''.code-input {
  height: 56px;
  padding: 0 var(--space-4) 0 44px;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.modal-dialog .code-input,
#master-password.code-input {
  padding-left: var(--space-4);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: none;
}'''
if old_block in css:
    css=css.replace(old_block,new_block)
    print('fixed modal code-input')
else:
    print('MISS modal code-input')

if css!=old:
    io.open(path,'w',encoding='utf-8',newline='\n').write(css)
    print('WRITTEN')
