const ts = require('typescript');

// Compare classes on one JSX element, keeping conditional branches separate.
// A selected row can share its hover color; the unselected state still changes.
function classVariants(node) {
  if (!node) return [''];
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return classVariants(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) {
    const yes = classVariants(node.whenTrue), no = classVariants(node.whenFalse);
    return [...yes, ...no];
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
    let array = node.expression.expression;
    if (ts.isCallExpression(array) && ts.isPropertyAccessExpression(array.expression) && array.expression.name.text === 'filter') array = array.expression.expression;
    if (ts.isArrayLiteralExpression(array)) {
      let values = [''];
      for (const item of array.elements) {
        const choices = classVariants(item);
        if (values.length * choices.length > 128) return values;
        values = values.flatMap(prefix => choices.map(choice => `${prefix} ${choice}`));
      }
      return values;
    }
  }
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      const choices = classVariants(span.expression);
      if (values.length * choices.length > 128) return values;
      values = values.flatMap(prefix => choices.map(choice => prefix + choice + span.literal.text));
    }
    return values;
  }
  // An unknown interpolation must not erase independently known static classes.
  return [''];
}

function findDeadHoverLines(source) {
  const file = ts.createSourceFile('ui.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = new Map();
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'className') {
      const variants = classVariants(node.initializer);
      if (variants?.length) {
        const tokens = variants.map(value => new Set(value.split(/\s+/).filter(Boolean)));
        const hasAnyHover = tokens.some(set => [...set].some(token => token.startsWith('hover:bg-')));
        const allStatesDead = hasAnyHover && tokens.every(set => {
          const hovers = [...set].filter(token => token.startsWith('hover:bg-'));
          return hovers.every(hover => set.has(hover.slice('hover:'.length)));
        });
        if (allStatesDead) {
          const hoverClasses = [...new Set(tokens.flatMap(set => [...set].filter(token => token.startsWith('hover:bg-'))))];
          findings.set(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, hoverClasses.join(' '));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

// Preserve the existing long-explanation heuristic, and accept a short actual
// action phrase too. A noun such as "등록일순" is not an instruction.
function emptyStateHasHint(raw) {
  const parts = [];
  for (const match of raw.matchAll(/>([^<>{}]+)</g)) parts.push(match[1]);
  for (const match of raw.matchAll(/"([^\"]{2,})"/g)) {
    const text = match[1];
    if (!/[:;{}]|^[a-z-]+$|px|rem|var\(|#[0-9a-f]{3}/i.test(text)) parts.push(text);
  }
  const text = parts.join(' ');
  const position = Math.max(text.lastIndexOf('없습니다'), text.lastIndexOf('없어요'));
  if (position < 0) return true;
  const after = text.slice(position).replace(/없습니다|없어요/g, '').replace(/[.\s·]/g, '');
  return after.length >= 10 || /(?:눌러|골라|찾아|지워|열어|알려|써|보내)(?:보세요|주세요)|(?:확인|조회|선택|변경|검색|추가|등록|입력|저장|재시도)(?:해보세요|해주세요|하세요)/.test(after);
}

module.exports = {findDeadHoverLines, emptyStateHasHint};
