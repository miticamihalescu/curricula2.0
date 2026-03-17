import os
import re

def insert_link(content):
    if '<link rel="stylesheet" href="styles.css">' not in content:
        content = content.replace('<style>', '<link rel="stylesheet" href="styles.css">\n    <style>')
    return content

def remove_blocks(content, selectors):
    for selector in selectors:
        # Match selector blocks. Handles optional trailing spaces and newlines before '{'
        # and non-nested CSS blocks. If keyframes, handles one level of nesting
        if selector.startswith('@keyframes'):
            pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\{[^{}]*\}[^{}]*\}', re.DOTALL)
            content = pattern.sub('', content)
        else:
            pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}', re.DOTALL)
            content = pattern.sub('', content)
    return content

def clean_file(filename, selectors_to_remove):
    if not os.path.exists(filename):
        return
    with open(filename, 'r') as f:
        content = f.read()
    
    content = insert_link(content)
    content = remove_blocks(content, selectors_to_remove)
    
    # clean up empty lines inside style
    content = re.sub(r'<style>\s+', '<style>\n        ', content)
    
    with open(filename, 'w') as f:
        f.write(content)

common_selectors = [
    ':root',
    '[data-theme="dark"]',
    '*,\n        *::before,\n        *::after',
    '*,\n        *::before,\n        *::after',
    '*, *::before, *::after',
    'html',
    'h1, h2, h3, h4, h5, h6',
    'h1,\n        h2,\n        h3,\n        h4,\n        h5,\n        h6',
    'a',
    'img',
    '.navbar',
    '.navbar.scrolled',
    '.navbar .container',
    '.logo',
    '.logo svg',
    '.nav-links',
    '.nav-links a',
    '.nav-links a::after',
    '.nav-links a:hover',
    '.nav-links a:hover::after',
    '.nav-right',
    '.btn-nav',
    '.nav-back',
    '.nav-back:hover',
    '.nav-back svg',
    '.btn-secondary',
    '.btn-secondary:hover',
    '.theme-toggle',
    '.theme-toggle:hover',
    '.theme-toggle svg',
    '.btn',
    '.btn-primary',
    '.btn-primary:hover',
    '.btn-primary:active',
    '.btn-primary:disabled',
    '.btn-outline',
    '.btn-outline:hover',
    '.btn-large',
    '.spinner',
    '@keyframes spin',
    '.message-box',
    '.message-box.error',
    '.message-box.success',
    '.form-group',
    '.form-label',
    '.form-label span.required',
    '.input-field',
    '[data-theme="dark"] .input-field',
    '.input-field:focus',
    '.input-field.input-error',
    '.helper-text'
]

# specific cleanups (like formatting differences)
common_selectors.extend([
    '*, *::before, *::after',
    '*,\n*::before,\n*::after',
    'h1, h2, h3, h4, h5, h6',
])

for f in ['index.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html', 'dashboard.html', 'upload.html']:
    clean_file(f, common_selectors)

print("CSS refactoring applied.")
