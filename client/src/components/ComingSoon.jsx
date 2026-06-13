export default function ComingSoon({ title }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
      <h2 className="text-2xl font-semibold text-pkf-navy mb-3">{title}</h2>
      <div className="inline-flex items-center gap-2 bg-pkf-orange/10 text-pkf-orange border border-pkf-orange/30 rounded-full px-4 py-2 text-sm font-medium">
        🚧 Em desenvolvimento
      </div>
      <p className="text-gray-500 mt-4 max-w-md mx-auto">
        Esta conciliação ainda está sendo desenvolvida e estará disponível em breve.
      </p>
    </div>
  );
}
