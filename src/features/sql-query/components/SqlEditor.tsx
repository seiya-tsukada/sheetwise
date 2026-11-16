import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { USER_SQL_TABLE_ALIAS } from '@/src/lib/duckdb/sqlQueryBuilder';

export interface SqlEditorHandle {
  /** カーソル位置（選択範囲）にテキストを挿入してフォーカスする */
  insert: (text: string) => void;
}

interface SqlEditorProps {
  value: string;
  columns: string[];
  onChange: (value: string) => void;
  onRun: () => void;
}

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'white',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    minHeight: '160px',
    maxHeight: '360px',
    lineHeight: '1.6',
  },
  '.cm-gutters': {
    backgroundColor: 'rgb(248 250 252)',
    borderRight: '1px solid rgb(241 245 249)',
    color: 'rgb(148 163 184)',
  },
  '.cm-activeLineGutter, .cm-activeLine': { backgroundColor: 'rgb(248 250 252)' },
});

function sqlLanguage(columns: string[]) {
  return sql({
    dialect: PostgreSQL,
    upperCaseKeywords: true,
    schema: { [USER_SQL_TABLE_ALIAS]: columns },
    defaultTable: USER_SQL_TABLE_ALIAS,
  });
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, columns, onChange, onRun },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  onRunRef.current();
                  return true;
                },
              },
            ])
          ),
          basicSetup,
          languageRef.current.of(sqlLanguage(columns)),
          placeholder(`SELECT * FROM ${USER_SQL_TABLE_ALIAS} LIMIT 100`),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // エディタは一度だけ生成し、以降の値・スキーマ変更は下の effect で反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageRef.current.reconfigure(sqlLanguage(columns)),
    });
  }, [columns]);

  // テンプレート・履歴の選択など、外部から値が差し替えられた場合のみ同期する
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    },
  }));

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-lg border border-slate-300 focus-within:border-blue-500"
    />
  );
});
