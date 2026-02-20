import { Injectable } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable()
export class AppPageTitleStrategy extends TitleStrategy {
  override updateTitle(_routerState: RouterStateSnapshot): void {
    document.title = 'MailMerge';
  }
}
