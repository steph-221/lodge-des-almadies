/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/hotel/session').SessionUser | null;
  }
}
