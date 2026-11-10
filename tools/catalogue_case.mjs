// Acceptance is decided after every owned cleanup and after late page errors.
const failure=error=>error instanceof Error?{name:error.name,message:error.message,stack:error.stack}
  :{name:'NonErrorRejection',message:'Non-Error rejection: '+String(error)};

export function catalogueCasePassed(item){
  return item.status==='passed'&&item.cleanup===true&&item.page_errors.length===0&&!(item.cleanup_errors?.length);
}

export async function closeCatalogueCase(item,owners){
  item.cleanup_owners={};item.cleanup_errors??=[];
  for(const[name,close]of owners){
    try {await close();item.cleanup_owners[name]={status:'closed'};}
    catch(error){
      const detail=failure(error);item.cleanup_owners[name]={status:'failed',...detail};
      item.cleanup_errors.push({owner:name,...detail});item.error??=detail;item.status='failed';
    }
  }
  item.cleanup=Object.values(item.cleanup_owners).every(owner=>owner.status==='closed');
  if(item.page_errors.length||item.cleanup_errors.length)item.status='failed';
}
