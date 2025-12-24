import BannerModel from '../models/bannerModel.js';

export const getActiveBanners = async (req, res, next) => {
    try {
        const banners = await BannerModel.findAllActive();
        res.json(banners);
    } catch (error) { next(error); }
};

export const getAllBanners = async (req, res, next) => {
    try {
        const banners = await BannerModel.findAll();
        res.json(banners);
    } catch (error) { next(error); }
};

export const createBanner = async (req, res, next) => {
    try {
        const newBanner = await BannerModel.create(req.body);
        res.status(201).json(newBanner);
    } catch (error) { next(error); }
};

export const updateBanner = async (req, res, next) => {
    try {
        const updatedBanner = await BannerModel.update(Number(req.params.id), req.body);
        res.json(updatedBanner);
    } catch (error) { next(error); }
};

export const deleteBanner = async (req, res, next) => {
    try {
        await BannerModel.remove(Number(req.params.id));
        res.json({ message: 'Banner removido com sucesso' });
    } catch (error) { next(error); }
};
