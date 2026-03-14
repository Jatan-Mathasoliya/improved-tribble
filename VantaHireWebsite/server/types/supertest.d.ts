declare module 'supertest' {
  interface SuperTestStatic {
    (app: any): any;
    agent(app: any): any;
  }
  const request: SuperTestStatic;
  export default request;
}
