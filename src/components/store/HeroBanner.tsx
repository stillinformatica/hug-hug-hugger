import bannerImg from "@/assets/banner.png";

export const HeroBanner = () => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 mt-4">
      <div className="w-full h-[280px] rounded-2xl overflow-hidden">
        <img
          src={bannerImg}
          alt="Still Informática - Next-Gen Gaming Power"
          className="w-full h-full object-cover object-top"
        />
      </div>
    </section>
  );
};
