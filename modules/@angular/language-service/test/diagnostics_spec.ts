/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';

import {createLanguageService} from '../src/language_service';
import {Completions, Diagnostic, Diagnostics} from '../src/types';
import {TypeScriptServiceHost} from '../src/typescript_host';

import {toh} from './test_data';
import {MockTypescriptHost, includeDiagnostic, noDiagnostics} from './test_utils';

describe('diagnostics', () => {
  let documentRegistry = ts.createDocumentRegistry();
  let mockHost = new MockTypescriptHost(['/app/main.ts', '/app/parsing-cases.ts'], toh);
  let service = ts.createLanguageService(mockHost, documentRegistry);
  let program = service.getProgram();
  let ngHost = new TypeScriptServiceHost(ts, mockHost, service);
  let ngService = createLanguageService(ngHost);
  ngHost.setSite(ngService);

  it('should be no diagnostics for test.ng',
     () => { expect(ngService.getDiagnostics('/app/test.ng')).toEqual([]); });

  describe('for semantic errors', () => {
    const fileName = '/app/test.ng';

    function diagnostics(template: string): Diagnostics {
      try {
        mockHost.override(fileName, template);
        return ngService.getDiagnostics(fileName);
      } finally {
        mockHost.override(fileName, undefined);
      }
    }

    function accept(template: string) { noDiagnostics(diagnostics(template)); }

    function reject(template: string, message: string): void;
    function reject(template: string, message: string, at: string): void;
    function reject(template: string, message: string, location: string): void;
    function reject(template: string, message: string, location: string, len: number): void;
    function reject(template: string, message: string, at?: number | string, len?: number): void {
      if (typeof at == 'string') {
        len = at.length;
        at = template.indexOf(at);
      }
      includeDiagnostic(diagnostics(template), message, at, len);
    }

    describe('with $event', () => {
      it('should accept an event',
         () => { accept('<div (click)="myClick($event)">Click me!</div>'); });
      it('should reject it when not in an event binding', () => {
        reject('<div [tabIndex]="$event"></div>', '\'$event\' is not defined', '$event');
      });
    });
  });

  describe('with regression tests', () => {

    it('should not crash with a incomplete *ngFor', () => {
      expect(() => {
        const code =
            '\n@Component({template: \'<div *ngFor></div> ~{after-div}\'}) export class MyComponent {}';
        addCode(code, fileName => { ngService.getDiagnostics(fileName); });
      }).not.toThrow();
    });

    it('should report a component not in a module', () => {
      const code = '\n@Component({template: \'<div></div>\'}) export class MyComponent {}';
      addCode(code, (fileName, content) => {
        const diagnostics = ngService.getDiagnostics(fileName);
        const offset = content.lastIndexOf('@Component') + 1;
        const len = 'Component'.length;
        includeDiagnostic(
            diagnostics, 'Component \'MyComponent\' is not included in a module', offset, len);
      });
    });

    it('should not report an error for a form\'s host directives', () => {
      const code = '\n@Component({template: \'<form></form>\'}) export class MyComponent {}';
      addCode(code, (fileName, content) => {
        const diagnostics = ngService.getDiagnostics(fileName);
        onlyModuleDiagnostics(diagnostics);
      });
    });

    it('should not throw getting diagnostics for an index expression', () => {
      const code =
          ` @Component({template: '<a *ngIf="(auth.isAdmin | async) || (event.leads && event.leads[(auth.uid | async)])"></a>'}) export class MyComponent {}`;
      addCode(
          code, fileName => { expect(() => ngService.getDiagnostics(fileName)).not.toThrow(); });
    });

    it('should not throw using a directive with no value', () => {
      const code =
          ` @Component({template: '<form><input [(ngModel)]="name" required /></form>'}) export class MyComponent { name = 'some name'; }`;
      addCode(
          code, fileName => { expect(() => ngService.getDiagnostics(fileName)).not.toThrow(); });
    });

    it('should report an error for invalid metadata', () => {
      const code =
          ` @Component({template: '', provider: [{provide: 'foo', useFactor: () => 'foo' }]}) export class MyComponent { name = 'some name'; }`;
      addCode(code, (fileName, content) => {
        const diagnostics = ngService.getDiagnostics(fileName);
        includeDiagnostic(
            diagnostics, 'Function calls are not supported.', '() => \'foo\'', content);
      });
    });

    function addCode(code: string, cb: (fileName: string, content?: string) => void) {
      const fileName = '/app/app.component.ts';
      const originalContent = mockHost.getFileContent(fileName);
      const newContent = originalContent + code;
      mockHost.override(fileName, originalContent + code);
      ngHost.updateAnalyzedModules();
      try {
        cb(fileName, newContent);
      } finally {
        mockHost.override(fileName, undefined);
      }
    }

    function onlyModuleDiagnostics(diagnostics: Diagnostics) {
      // Expect only the 'MyComponent' diagnostic
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].message.indexOf('MyComponent') >= 0).toBeTruthy();
    }
  });
});
