import bannerMobile from "@/assets/banner.png";
import bannerDesktop from "@/assets/banner-desktop.jpg";

export const HeroBanner = () => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 mt-4">
      <div className="w-full rounded-2xl overflow-hidden">
        <picture>
          <source media="(min-width: 768px)" srcSet={bannerDesktop} />
          <img
            src={bannerMobile}
            alt="Still Informática"
            className="w-full h-auto object-contain"
          />
        </picture>
      </div>
    </section>
  );
};