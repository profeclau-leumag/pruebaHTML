const crypto = require("crypto");
const { Pool } = require("pg");

if(!process.env.DATABASE_URL){ console.error("Falta DATABASE_URL."); process.exit(1); }

const pool=new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined
});

const demos=[
  {
    title:"Teorema de Pitágoras: idea principal y uso",subject:"Matemática",level:"Educación Media",topic:"Geometría",
    content:"En un triángulo rectángulo, el cuadrado de la longitud de la hipotenusa es igual a la suma de los cuadrados de las longitudes de los catetos. Esta relación permite calcular una longitud desconocida cuando se conocen las otras dos. Antes de aplicarla, es necesario reconocer correctamente cuál lado es la hipotenusa: siempre se encuentra frente al ángulo recto. El teorema también sirve para verificar si un triángulo con tres longitudes dadas es rectángulo.",
    sources:"Ejemplo demostrativo redactado para Resumenoteca.",author_alias:"Equipo Resumenoteca"
  },
  {
    title:"Fotosíntesis: transformación de energía",subject:"Ciencias",level:"Educación Media",topic:"Biología",
    content:"La fotosíntesis es un proceso mediante el cual organismos como las plantas capturan energía luminosa y la transforman en energía química. En términos generales, utilizan dióxido de carbono y agua para producir compuestos orgánicos, liberando oxígeno. El proceso depende de estructuras celulares especializadas y permite incorporar energía a numerosos ecosistemas. Para comprenderla conviene distinguir entre los materiales que ingresan, los productos y la función de la energía luminosa.",
    sources:"Ejemplo demostrativo redactado para Resumenoteca.",author_alias:"Equipo Resumenoteca"
  },
  {
    title:"Revolución Industrial: cambios principales",subject:"Historia",level:"Educación Media",topic:"Siglos XVIII y XIX",
    content:"La Revolución Industrial transformó la producción mediante nuevas fuentes de energía, maquinaria y formas de organización del trabajo. Su desarrollo inicial estuvo asociado a Gran Bretaña y luego se extendió a otros territorios. Además de aumentar la producción, produjo cambios sociales y urbanos: crecimiento de ciudades, nuevas relaciones laborales y expansión de grupos sociales vinculados a la industria. Sus efectos fueron económicos, tecnológicos, sociales y ambientales.",
    sources:"Ejemplo demostrativo redactado para Resumenoteca.",author_alias:"Equipo Resumenoteca"
  }
];

(async()=>{
  const count=await pool.query("SELECT COUNT(*)::int AS n FROM summaries");
  if(count.rows[0].n>0){ console.log("La base ya contiene resúmenes; no se agregaron ejemplos."); await pool.end(); return; }
  for(const d of demos){
    await pool.query(
      `INSERT INTO summaries (id,title,subject,level,topic,content,sources,author_alias,status,approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',NOW())`,
      [crypto.randomUUID(),d.title,d.subject,d.level,d.topic,d.content,d.sources,d.author_alias]);
  }
  console.log("Se agregaron 3 resúmenes de ejemplo.");
  await pool.end();
})().catch(async err=>{ console.error(err); await pool.end(); process.exit(1); });